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
import { ValidationError, isValidUUID } from '../shared/validation';

/**
 * Critical Operation-Processes HTTP trigger function
 * Handles CRUD operations for critical-operation-process junction table
 */
export async function criticalOperationProcessesFunction(
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
    await setSessionContext(pool, userProfile.id, userProfile.azureAdObjectId, userProfile.role);

    const url = new URL(request.url);
    const id = url.searchParams.get('id');
    const criticalOperationId = url.searchParams.get('critical_operation_id');
    const processId = url.searchParams.get('process_id');

    switch (request.method) {
      case 'GET':
        return await handleGet(id, criticalOperationId, processId, userProfile, corsHeaders, context);

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
    context.error('Error in critical-operation-processes function:', error);

    const status = error instanceof ValidationError
      ? 400
      : error.message?.includes('Token') || error.message?.includes('Authorization') || error.message?.includes('Authentication')
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
 * Handle GET request - Retrieve critical-operation-process junction(s)
 */
async function handleGet(
  id: string | null,
  criticalOperationId: string | null,
  processId: string | null,
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
        jsonBody: { error: 'Invalid ID format' },
      };
    }

    // Get single junction record
    const result = await query(
      `SELECT cop.*, co.operation_name, p.process_name
       FROM critical_operation_processes cop
       INNER JOIN critical_operations co ON cop.critical_operation_id = co.id
       INNER JOIN processes p ON cop.process_id = p.id
       WHERE cop.id = $1`,
      [id]
    );

    if (result.rows.length === 0) {
      return {
        status: 404,
        headers: corsHeaders,
        jsonBody: { error: 'Critical Operation-Process junction not found' },
      };
    }

    return {
      status: 200,
      headers: corsHeaders,
      jsonBody: { data: result.rows[0] },
    };
  } else if (criticalOperationId || processId) {
    // Filter by critical_operation_id or process_id
    let queryStr = `SELECT cop.*, co.operation_name, p.process_name
                    FROM critical_operation_processes cop
                    INNER JOIN critical_operations co ON cop.critical_operation_id = co.id
                    INNER JOIN processes p ON cop.process_id = p.id
                    WHERE 1=1`;
    const params: string[] = [];
    let paramIndex = 1;

    if (criticalOperationId) {
      queryStr += ` AND cop.critical_operation_id = $${paramIndex}`;
      params.push(criticalOperationId);
      paramIndex++;
    }

    if (processId) {
      queryStr += ` AND cop.process_id = $${paramIndex}`;
      params.push(processId);
    }

    const result = await query(queryStr, params);

    return {
      status: 200,
      headers: corsHeaders,
      jsonBody: { data: result.rows },
    };
  } else {
    // Get all junctions
    const result = await query(
      `SELECT cop.*, co.operation_name, p.process_name
       FROM critical_operation_processes cop
       INNER JOIN critical_operations co ON cop.critical_operation_id = co.id
       INNER JOIN processes p ON cop.process_id = p.id
       ORDER BY co.operation_name, p.process_name`
    );

    return {
      status: 200,
      headers: corsHeaders,
      jsonBody: { data: result.rows },
    };
  }
}

/**
 * Handle POST request - Create new critical-operation-process junction
 */
async function handlePost(
  request: HttpRequest,
  userProfile: any,
  corsHeaders: Record<string, string>,
  context: InvocationContext
): Promise<HttpResponseInit> {
  // Check permissions - only promasters can modify
  if (!hasRole(userProfile.role, ['promaster'])) {
    return {
      status: 403,
      headers: corsHeaders,
      jsonBody: { error: 'Insufficient permissions. Only Promasters can create critical operation-process junctions.' },
    };
  }

  const body = await request.json() as any;

  if (!body.critical_operation_id || !body.process_id) {
    throw new ValidationError('critical_operation_id and process_id are required');
  }

  if (!isValidUUID(body.critical_operation_id) || !isValidUUID(body.process_id)) {
    throw new ValidationError('Invalid UUID format');
  }

  const result = await query(
    `INSERT INTO critical_operation_processes (
      critical_operation_id, process_id
    ) VALUES ($1, $2)
    RETURNING *`,
    [
      body.critical_operation_id,
      body.process_id,
    ]
  );

  return {
    status: 201,
    headers: corsHeaders,
    jsonBody: { data: result.rows[0] },
  };
}

/**
 * Handle DELETE request - Delete critical-operation-process junction
 */
async function handleDelete(
  id: string | null,
  userProfile: any,
  corsHeaders: Record<string, string>,
  context: InvocationContext
): Promise<HttpResponseInit> {
  if (!id) {
    return {
      status: 400,
      headers: corsHeaders,
      jsonBody: { error: 'ID is required' },
    };
  }

  if (!isValidUUID(id)) {
    return {
      status: 400,
      headers: corsHeaders,
      jsonBody: { error: 'Invalid ID format' },
    };
  }

  // Check permissions - only promasters can modify
  if (!hasRole(userProfile.role, ['promaster'])) {
    return {
      status: 403,
      headers: corsHeaders,
      jsonBody: { error: 'Insufficient permissions. Only Promasters can delete critical operation-process junctions.' },
    };
  }

  const result = await query('DELETE FROM critical_operation_processes WHERE id = $1 RETURNING id', [id]);

  if (result.rows.length === 0) {
    return {
      status: 404,
      headers: corsHeaders,
      jsonBody: { error: 'Critical Operation-Process junction not found' },
    };
  }

  return {
    status: 200,
    headers: corsHeaders,
    jsonBody: { success: true },
  };
}

// Register the function
app.http('critical-operation-processes', {
  methods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
  authLevel: 'anonymous',
  handler: criticalOperationProcessesFunction,
});
