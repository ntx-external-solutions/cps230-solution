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
import { validateProcessControlInput, ValidationError, isValidUUID } from '../shared/validation';

/**
 * Process-Controls HTTP trigger function
 * Handles CRUD operations for process-control junction table
 */
export async function processControlsFunction(
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
    const processId = url.searchParams.get('process_id');
    const controlId = url.searchParams.get('control_id');

    switch (request.method) {
      case 'GET':
        return await handleGet(id, processId, controlId, userProfile, corsHeaders, context);

      case 'POST':
        return await handlePost(request, userProfile, corsHeaders, context);

      case 'PUT':
      case 'PATCH':
        return await handleUpdate(request, id, userProfile, corsHeaders, context);

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
    context.error('Error in process-controls function:', error);

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
 * Handle GET request - Retrieve process-control junction(s)
 */
async function handleGet(
  id: string | null,
  processId: string | null,
  controlId: string | null,
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
      `SELECT pc.*, p.process_name, c.control_name
       FROM process_controls pc
       INNER JOIN processes p ON pc.process_id = p.id
       INNER JOIN controls c ON pc.control_id = c.id
       WHERE pc.id = $1`,
      [id]
    );

    if (result.rows.length === 0) {
      return {
        status: 404,
        headers: corsHeaders,
        jsonBody: { error: 'Process-Control junction not found' },
      };
    }

    return {
      status: 200,
      headers: corsHeaders,
      jsonBody: { data: result.rows[0] },
    };
  } else if (processId || controlId) {
    // Filter by process_id or control_id
    let queryStr = `SELECT pc.*, p.process_name, c.control_name
                    FROM process_controls pc
                    INNER JOIN processes p ON pc.process_id = p.id
                    INNER JOIN controls c ON pc.control_id = c.id
                    WHERE 1=1`;
    const params: string[] = [];
    let paramIndex = 1;

    if (processId) {
      queryStr += ` AND pc.process_id = $${paramIndex}`;
      params.push(processId);
      paramIndex++;
    }

    if (controlId) {
      queryStr += ` AND pc.control_id = $${paramIndex}`;
      params.push(controlId);
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
      `SELECT pc.*, p.process_name, c.control_name
       FROM process_controls pc
       INNER JOIN processes p ON pc.process_id = p.id
       INNER JOIN controls c ON pc.control_id = c.id
       ORDER BY p.process_name, c.control_name`
    );

    return {
      status: 200,
      headers: corsHeaders,
      jsonBody: { data: result.rows },
    };
  }
}

/**
 * Handle POST request - Create new process-control junction
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
      jsonBody: { error: 'Insufficient permissions. Only Promasters can create process-control junctions.' },
    };
  }

  const body = await request.json() as any;
  const validatedData = validateProcessControlInput(body);

  const result = await query(
    `INSERT INTO process_controls (
      process_id, control_id, process_step, activity_description
    ) VALUES ($1, $2, $3, $4)
    RETURNING *`,
    [
      validatedData.process_id,
      validatedData.control_id,
      validatedData.process_step || null,
      validatedData.activity_description || null,
    ]
  );

  return {
    status: 201,
    headers: corsHeaders,
    jsonBody: { data: result.rows[0] },
  };
}

/**
 * Handle PUT/PATCH request - Update process-control junction
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
      jsonBody: { error: 'Insufficient permissions. Only Promasters can update process-control junctions.' },
    };
  }

  const body = await request.json() as any;

  // For updates, we only allow updating process_step and activity_description
  const sanitized: any = {};
  if (body.process_step !== undefined) sanitized.process_step = body.process_step;
  if (body.activity_description !== undefined) sanitized.activity_description = body.activity_description;

  const result = await query(
    `UPDATE process_controls SET
      process_step = COALESCE($1, process_step),
      activity_description = COALESCE($2, activity_description)
    WHERE id = $3
    RETURNING *`,
    [
      sanitized.process_step,
      sanitized.activity_description,
      id,
    ]
  );

  if (result.rows.length === 0) {
    return {
      status: 404,
      headers: corsHeaders,
      jsonBody: { error: 'Process-Control junction not found' },
    };
  }

  return {
    status: 200,
    headers: corsHeaders,
    jsonBody: { data: result.rows[0] },
  };
}

/**
 * Handle DELETE request - Delete process-control junction
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
      jsonBody: { error: 'Insufficient permissions. Only Promasters can delete process-control junctions.' },
    };
  }

  const result = await query('DELETE FROM process_controls WHERE id = $1 RETURNING id', [id]);

  if (result.rows.length === 0) {
    return {
      status: 404,
      headers: corsHeaders,
      jsonBody: { error: 'Process-Control junction not found' },
    };
  }

  return {
    status: 200,
    headers: corsHeaders,
    jsonBody: { success: true },
  };
}

// Register the function
app.http('process-controls', {
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  authLevel: 'anonymous',
  handler: processControlsFunction,
});
