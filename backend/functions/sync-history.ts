import {
  app,
  HttpRequest,
  HttpResponseInit,
  InvocationContext,
} from '@azure/functions';
import {
  authenticateRequest,
  getCorsHeaders,
  getUserProfile,
  hasRole,
} from '../shared/auth';
import { query, setSessionContext, getPool } from '../shared/database';
import { ValidationError, isValidUUID } from '../shared/validation';

/**
 * Sync History HTTP trigger function
 * Handles retrieval and management of sync history records
 */
export async function syncHistoryFunction(
  request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  const origin = request.headers.get('origin');
  const corsHeaders = getCorsHeaders(origin);

  // Handle CORS preflight
  if (request.method === 'OPTIONS') {
    return {
      status: 204,
      headers: corsHeaders,
    };
  }

  try {
    // Authenticate user
    const decodedToken = await authenticateRequest(request);
    const userProfile = await getUserProfile(decodedToken);

    // Set session context for RLS
    const pool = getPool();
    await setSessionContext(pool, userProfile.azureAdObjectId, userProfile.role);

    const url = new URL(request.url);
    const id = url.searchParams.get('id');
    const limit = url.searchParams.get('limit') || '50';
    const status = url.searchParams.get('status');

    switch (request.method) {
      case 'GET':
        return await handleGet(id, parseInt(limit), status, userProfile, corsHeaders, context);

      case 'POST':
        return await handlePost(request, userProfile, corsHeaders, context);

      case 'PUT':
      case 'PATCH':
        return await handleUpdate(request, id, userProfile, corsHeaders, context);

      default:
        return {
          status: 405,
          headers: corsHeaders,
          jsonBody: { error: 'Method not allowed' },
        };
    }
  } catch (error: any) {
    context.error('Error in sync-history function:', error);

    const status = error instanceof ValidationError
      ? 400
      : error.message?.includes('Token')
      ? 401
      : error.message?.includes('permission') || error.message?.includes('role')
      ? 403
      : 500;

    return {
      status,
      headers: corsHeaders,
      jsonBody: {
        error: error.message || 'An error occurred',
      },
    };
  }
}

/**
 * Handle GET request - Retrieve sync history record(s)
 */
async function handleGet(
  id: string | null,
  limit: number,
  statusFilter: string | null,
  userProfile: any,
  corsHeaders: Record<string, string>,
  context: InvocationContext
): Promise<HttpResponseInit> {
  if (id) {
    // Validate UUID
    if (!isValidUUID(id)) {
      return {
        status: 400,
        headers: corsHeaders,
        jsonBody: { error: 'Invalid sync history ID format' },
      };
    }

    // Get single sync history record
    const result = await query(
      'SELECT * FROM sync_history WHERE id = $1',
      [id]
    );

    if (result.rows.length === 0) {
      return {
        status: 404,
        headers: corsHeaders,
        jsonBody: { error: 'Sync history record not found' },
      };
    }

    return {
      status: 200,
      headers: corsHeaders,
      jsonBody: { data: result.rows[0] },
    };
  } else {
    // Get sync history records with optional filtering
    let queryStr = 'SELECT * FROM sync_history WHERE 1=1';
    const params: any[] = [];
    let paramIndex = 1;

    if (statusFilter) {
      queryStr += ` AND status = $${paramIndex}`;
      params.push(statusFilter);
      paramIndex++;
    }

    queryStr += ` ORDER BY started_at DESC LIMIT $${paramIndex}`;
    params.push(limit);

    const result = await query(queryStr, params);

    return {
      status: 200,
      headers: corsHeaders,
      jsonBody: { data: result.rows },
    };
  }
}

/**
 * Handle POST request - Create new sync history record
 * This is typically called at the start of a sync operation
 */
async function handlePost(
  request: HttpRequest,
  userProfile: any,
  corsHeaders: Record<string, string>,
  context: InvocationContext
): Promise<HttpResponseInit> {
  // Check permissions - only promasters can initiate sync
  if (!hasRole(userProfile.role, ['promaster'])) {
    return {
      status: 403,
      headers: corsHeaders,
      jsonBody: { error: 'Insufficient permissions. Only Promasters can create sync history records.' },
    };
  }

  const body = await request.json() as any;

  // Validate required fields
  if (!body.sync_type) {
    return {
      status: 400,
      headers: corsHeaders,
      jsonBody: { error: 'sync_type is required' },
    };
  }

  const validSyncTypes = ['full', 'incremental', 'processes', 'systems'];
  if (!validSyncTypes.includes(body.sync_type)) {
    return {
      status: 400,
      headers: corsHeaders,
      jsonBody: { error: 'sync_type must be one of: full, incremental, processes, systems' },
    };
  }

  const result = await query(
    `INSERT INTO sync_history (
      sync_type, status, records_synced, error_message, initiated_by
    ) VALUES ($1, $2, $3, $4, $5)
    RETURNING *`,
    [
      body.sync_type,
      body.status || 'in_progress',
      body.records_synced || 0,
      body.error_message || null,
      userProfile.email,
    ]
  );

  return {
    status: 201,
    headers: corsHeaders,
    jsonBody: { data: result.rows[0] },
  };
}

/**
 * Handle PUT/PATCH request - Update sync history record
 * This is typically called to update sync status or completion
 */
async function handleUpdate(
  request: HttpRequest,
  id: string | null,
  userProfile: any,
  corsHeaders: Record<string, string>,
  context: InvocationContext
): Promise<HttpResponseInit> {
  if (!id) {
    return {
      status: 400,
      headers: corsHeaders,
      jsonBody: { error: 'Sync history ID is required' },
    };
  }

  if (!isValidUUID(id)) {
    return {
      status: 400,
      headers: corsHeaders,
      jsonBody: { error: 'Invalid sync history ID format' },
    };
  }

  // Check permissions - only promasters can update sync history
  if (!hasRole(userProfile.role, ['promaster'])) {
    return {
      status: 403,
      headers: corsHeaders,
      jsonBody: { error: 'Insufficient permissions. Only Promasters can update sync history.' },
    };
  }

  const body = await request.json() as any;

  // Build update query dynamically
  const updates: string[] = [];
  const params: any[] = [];
  let paramIndex = 1;

  if (body.status !== undefined) {
    const validStatuses = ['success', 'failed', 'in_progress'];
    if (!validStatuses.includes(body.status)) {
      return {
        status: 400,
        headers: corsHeaders,
        jsonBody: { error: 'status must be one of: success, failed, in_progress' },
      };
    }
    updates.push(`status = $${paramIndex}`);
    params.push(body.status);
    paramIndex++;
  }

  if (body.records_synced !== undefined) {
    updates.push(`records_synced = $${paramIndex}`);
    params.push(body.records_synced);
    paramIndex++;
  }

  if (body.error_message !== undefined) {
    updates.push(`error_message = $${paramIndex}`);
    params.push(body.error_message);
    paramIndex++;
  }

  // If status is success or failed, set completed_at
  if (body.status === 'success' || body.status === 'failed') {
    updates.push(`completed_at = NOW()`);
  }

  if (updates.length === 0) {
    return {
      status: 400,
      headers: corsHeaders,
      jsonBody: { error: 'No valid fields to update' },
    };
  }

  params.push(id);
  const queryStr = `UPDATE sync_history SET ${updates.join(', ')} WHERE id = $${paramIndex} RETURNING *`;

  const result = await query(queryStr, params);

  if (result.rows.length === 0) {
    return {
      status: 404,
      headers: corsHeaders,
      jsonBody: { error: 'Sync history record not found' },
    };
  }

  return {
    status: 200,
    headers: corsHeaders,
    jsonBody: { data: result.rows[0] },
  };
}

// Register the function
app.http('sync-history', {
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'OPTIONS'],
  authLevel: 'anonymous',
  handler: syncHistoryFunction,
});
