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
import { validateProcessSystemInput, ValidationError, isValidUUID } from '../shared/validation';

/**
 * Process-Systems HTTP trigger function
 * Handles CRUD operations for process-system junction table
 */
export async function processSystemsFunction(
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
    const systemId = url.searchParams.get('system_id');

    switch (request.method) {
      case 'GET':
        return await handleGet(id, processId, systemId, userProfile, corsHeaders, context);

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
    context.error('Error in process-systems function:', error);

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
 * Handle GET request - Retrieve process-system junction(s)
 */
async function handleGet(
  id: string | null,
  processId: string | null,
  systemId: string | null,
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
      `SELECT ps.*, p.process_name, s.system_name
       FROM process_systems ps
       INNER JOIN processes p ON ps.process_id = p.id
       INNER JOIN systems s ON ps.system_id = s.id
       WHERE ps.id = $1`,
      [id]
    );

    if (result.rows.length === 0) {
      return {
        status: 404,
        headers: corsHeaders,
        jsonBody: { error: 'Process-System junction not found' },
      };
    }

    return {
      status: 200,
      headers: corsHeaders,
      jsonBody: { data: result.rows[0] },
    };
  } else if (processId || systemId) {
    // Filter by process_id or system_id
    let queryStr = `SELECT ps.*, p.process_name, s.system_name
                    FROM process_systems ps
                    INNER JOIN processes p ON ps.process_id = p.id
                    INNER JOIN systems s ON ps.system_id = s.id
                    WHERE 1=1`;
    const params: string[] = [];
    let paramIndex = 1;

    if (processId) {
      queryStr += ` AND ps.process_id = $${paramIndex}`;
      params.push(processId);
      paramIndex++;
    }

    if (systemId) {
      queryStr += ` AND ps.system_id = $${paramIndex}`;
      params.push(systemId);
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
      `SELECT ps.*, p.process_name, s.system_name
       FROM process_systems ps
       INNER JOIN processes p ON ps.process_id = p.id
       INNER JOIN systems s ON ps.system_id = s.id
       ORDER BY p.process_name, s.system_name`
    );

    return {
      status: 200,
      headers: corsHeaders,
      jsonBody: { data: result.rows },
    };
  }
}

/**
 * Handle POST request - Create new process-system junction
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
      jsonBody: { error: 'Insufficient permissions. Only Promasters can create process-system junctions.' },
    };
  }

  const body = await request.json() as any;
  const validatedData = validateProcessSystemInput(body);

  const result = await query(
    `INSERT INTO process_systems (
      process_id, system_id, process_step, activity_description
    ) VALUES ($1, $2, $3, $4)
    RETURNING *`,
    [
      validatedData.process_id,
      validatedData.system_id,
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
 * Handle PUT/PATCH request - Update process-system junction
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
      jsonBody: { error: 'Insufficient permissions. Only Promasters can update process-system junctions.' },
    };
  }

  const body = await request.json() as any;

  // For updates, we only allow updating process_step and activity_description
  const sanitized: any = {};
  if (body.process_step !== undefined) sanitized.process_step = body.process_step;
  if (body.activity_description !== undefined) sanitized.activity_description = body.activity_description;

  const result = await query(
    `UPDATE process_systems SET
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
      jsonBody: { error: 'Process-System junction not found' },
    };
  }

  return {
    status: 200,
    headers: corsHeaders,
    jsonBody: { data: result.rows[0] },
  };
}

/**
 * Handle DELETE request - Delete process-system junction
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
      jsonBody: { error: 'Insufficient permissions. Only Promasters can delete process-system junctions.' },
    };
  }

  const result = await query('DELETE FROM process_systems WHERE id = $1 RETURNING id', [id]);

  if (result.rows.length === 0) {
    return {
      status: 404,
      headers: corsHeaders,
      jsonBody: { error: 'Process-System junction not found' },
    };
  }

  return {
    status: 200,
    headers: corsHeaders,
    jsonBody: { success: true },
  };
}

// Register the function
app.http('process-systems', {
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  authLevel: 'anonymous',
  handler: processSystemsFunction,
});
