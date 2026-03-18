import {
  app,
  HttpRequest,
  HttpResponseInit,
  InvocationContext,
} from '@azure/functions';
import {
  authenticateRequestUnified,
  getCorsHeaders,
  hasRole,
} from '../shared/auth';
import { query, setSessionContext, getPool } from '../shared/database';
import { isValidUUID } from '../shared/validation';

/**
 * Control-Processes Junction Table HTTP trigger function
 * Manages many-to-many relationships between controls and processes
 */
export async function controlProcessesFunction(
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
    const userProfile = await authenticateRequestUnified(request);

    // Set session context for RLS
    const pool = getPool();
    await setSessionContext(
      pool,
      userProfile.id,
      userProfile.azureAdObjectId,
      userProfile.role
    );

    const url = new URL(request.url);
    const id = url.searchParams.get('id');
    const controlId = url.searchParams.get('control_id');
    const processId = url.searchParams.get('process_id');

    switch (request.method) {
      case 'GET':
        return await handleGet(id, controlId, processId, userProfile, corsHeaders, context);

      case 'POST':
        return await handlePost(request, userProfile, corsHeaders, context);

      case 'DELETE':
        return await handleDelete(id, userProfile, corsHeaders, context);

      default:
        return {
          status: 405,
          headers: corsHeaders,
          jsonBody: { error: 'Method not allowed' },
        };
    }
  } catch (error: any) {
    context.error('Error in control-processes function:', error);

    const status =
      error.message?.includes('Token') ||
      error.message?.includes('Authorization') ||
      error.message?.includes('Authentication')
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
 * Handle GET request - List control-process relationships
 */
async function handleGet(
  id: string | null,
  controlId: string | null,
  processId: string | null,
  userProfile: any,
  corsHeaders: Record<string, string>,
  context: InvocationContext
): Promise<HttpResponseInit> {
  if (id) {
    if (!isValidUUID(id)) {
      return {
        status: 400,
        headers: corsHeaders,
        jsonBody: { error: 'Invalid id format' },
      };
    }
    const result = await query(
      'SELECT * FROM control_processes WHERE id = $1',
      [id]
    );

    if (result.rows.length === 0) {
      return {
        status: 404,
        headers: corsHeaders,
        jsonBody: { error: 'Relationship not found' },
      };
    }

    return {
      status: 200,
      headers: corsHeaders,
      jsonBody: { data: result.rows[0] },
    };
  }

  // Filter by control_id or process_id
  let queryText = 'SELECT * FROM control_processes WHERE 1=1';
  const params: any[] = [];

  if (controlId) {
    if (!isValidUUID(controlId)) {
      return {
        status: 400,
        headers: corsHeaders,
        jsonBody: { error: 'Invalid control_id format' },
      };
    }
    params.push(controlId);
    queryText += ` AND control_id = $${params.length}`;
  }

  if (processId) {
    if (!isValidUUID(processId)) {
      return {
        status: 400,
        headers: corsHeaders,
        jsonBody: { error: 'Invalid process_id format' },
      };
    }
    params.push(processId);
    queryText += ` AND process_id = $${params.length}`;
  }

  queryText += ' ORDER BY created_at DESC';

  const result = await query(queryText, params);

  return {
    status: 200,
    headers: corsHeaders,
    jsonBody: { data: result.rows },
  };
}

/**
 * Handle POST request - Create control-process relationship
 */
async function handlePost(
  request: HttpRequest,
  userProfile: any,
  corsHeaders: Record<string, string>,
  context: InvocationContext
): Promise<HttpResponseInit> {
  // Only promasters and business analysts can create relationships
  if (!hasRole(userProfile.role, ['promaster', 'business_analyst'])) {
    return {
      status: 403,
      headers: corsHeaders,
      jsonBody: { error: 'Insufficient permissions' },
    };
  }

  const body = (await request.json()) as any;
  const { control_id, process_id } = body;

  if (!control_id || !process_id) {
    return {
      status: 400,
      headers: corsHeaders,
      jsonBody: { error: 'control_id and process_id are required' },
    };
  }

  if (!isValidUUID(control_id)) {
    return {
      status: 400,
      headers: corsHeaders,
      jsonBody: { error: 'Invalid control_id format' },
    };
  }

  if (!isValidUUID(process_id)) {
    return {
      status: 400,
      headers: corsHeaders,
      jsonBody: { error: 'Invalid process_id format' },
    };
  }

  const result = await query(
    `INSERT INTO control_processes (
      control_id, process_id, modified_by
    ) VALUES ($1, $2, $3)
    ON CONFLICT (control_id, process_id) DO NOTHING
    RETURNING *`,
    [control_id, process_id, userProfile.email]
  );

  return {
    status: 201,
    headers: corsHeaders,
    jsonBody: { data: result.rows[0] },
  };
}

/**
 * Handle DELETE request - Remove control-process relationship
 */
async function handleDelete(
  id: string | null,
  userProfile: any,
  corsHeaders: Record<string, string>,
  context: InvocationContext
): Promise<HttpResponseInit> {
  // Only promasters and business analysts can delete relationships
  if (!hasRole(userProfile.role, ['promaster', 'business_analyst'])) {
    return {
      status: 403,
      headers: corsHeaders,
      jsonBody: { error: 'Insufficient permissions' },
    };
  }

  if (!id) {
    return {
      status: 400,
      headers: corsHeaders,
      jsonBody: { error: 'id parameter is required' },
    };
  }

  if (!isValidUUID(id)) {
      return {
        status: 400,
        headers: corsHeaders,
        jsonBody: { error: 'Invalid id format' },
      };
    }

  const result = await query(
    'DELETE FROM control_processes WHERE id = $1 RETURNING *',
    [id]
  );

  if (result.rows.length === 0) {
    return {
      status: 404,
      headers: corsHeaders,
      jsonBody: { error: 'Relationship not found' },
    };
  }

  return {
    status: 200,
    headers: corsHeaders,
    jsonBody: { data: result.rows[0] },
  };
}

// Register the function
app.http('control-processes', {
  methods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
  authLevel: 'anonymous',
  handler: controlProcessesFunction,
});
