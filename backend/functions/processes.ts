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
import { validateProcessInput, ValidationError, isValidUUID } from '../shared/validation';

/**
 * Processes HTTP trigger function
 * Handles CRUD operations for processes
 */
export async function processesFunction(
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

    switch (request.method) {
      case 'GET':
        return await handleGet(id, userProfile, corsHeaders, context);

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
    context.error('Error in processes function:', error);

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
 * Handle GET request - Retrieve process(es)
 */
async function handleGet(
  id: string | null,
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
        jsonBody: { error: 'Invalid process ID format' },
      };
    }

    // Get single process with related data
    const processResult = await query(
      'SELECT * FROM processes WHERE id = $1',
      [id]
    );

    if (processResult.rows.length === 0) {
      return {
        status: 404,
        headers: corsHeaders,
        jsonBody: { error: 'Process not found' },
      };
    }

    const process = processResult.rows[0];

    // Get associated systems
    const systemsResult = await query(
      `SELECT s.id, s.system_name
       FROM systems s
       INNER JOIN process_systems ps ON ps.system_id = s.id
       WHERE ps.process_id = $1`,
      [id]
    );

    // Get associated controls
    const controlsResult = await query(
      `SELECT c.id, c.control_name
       FROM controls c
       INNER JOIN process_controls pc ON pc.control_id = c.id
       WHERE pc.process_id = $1`,
      [id]
    );

    // Get associated critical operations
    const criticalOpsResult = await query(
      'SELECT id, operation_name FROM critical_operations WHERE process_id = $1',
      [id]
    );

    return {
      status: 200,
      headers: corsHeaders,
      jsonBody: {
        data: {
          ...process,
          systems: systemsResult.rows,
          controls: controlsResult.rows,
          criticalOperations: criticalOpsResult.rows,
        },
      },
    };
  } else {
    // Get all processes
    const processesResult = await query(
      'SELECT * FROM processes ORDER BY process_name ASC'
    );

    // For each process, get related data
    const processesWithRelations = await Promise.all(
      processesResult.rows.map(async (process: any) => {
        const systemsResult = await query(
          `SELECT s.id, s.system_name
           FROM systems s
           INNER JOIN process_systems ps ON ps.system_id = s.id
           WHERE ps.process_id = $1`,
          [process.id]
        );

        const controlsResult = await query(
          `SELECT c.id, c.control_name
           FROM controls c
           INNER JOIN process_controls pc ON pc.control_id = c.id
           WHERE pc.process_id = $1`,
          [process.id]
        );

        const criticalOpsResult = await query(
          'SELECT id, operation_name FROM critical_operations WHERE process_id = $1',
          [process.id]
        );

        return {
          ...process,
          systems: systemsResult.rows,
          controls: controlsResult.rows,
          criticalOperations: criticalOpsResult.rows,
        };
      })
    );

    return {
      status: 200,
      headers: corsHeaders,
      jsonBody: { data: processesWithRelations },
    };
  }
}

/**
 * Handle POST request - Create new process
 */
async function handlePost(
  request: HttpRequest,
  userProfile: any,
  corsHeaders: Record<string, string>,
  context: InvocationContext
): Promise<HttpResponseInit> {
  // Check permissions
  if (!hasRole(userProfile.role, ['business_analyst', 'promaster'])) {
    return {
      status: 403,
      headers: corsHeaders,
      jsonBody: { error: 'Insufficient permissions' },
    };
  }

  const body = await request.json() as any;
  const validatedData = validateProcessInput(body);

  const result = await query(
    `INSERT INTO processes (
      process_name, process_unique_id, owner_username, input_processes,
      output_processes, canvas_position, metadata, regions, modified_by
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    RETURNING *`,
    [
      validatedData.process_name,
      validatedData.process_unique_id,
      validatedData.owner_username || null,
      validatedData.input_processes || [],
      validatedData.output_processes || [],
      validatedData.canvas_position || null,
      validatedData.metadata || null,
      validatedData.regions || [],
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
 * Handle PUT/PATCH request - Update process
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
      jsonBody: { error: 'Process ID is required' },
    };
  }

  if (!isValidUUID(id)) {
    return {
      status: 400,
      headers: corsHeaders,
      jsonBody: { error: 'Invalid process ID format' },
    };
  }

  // Check permissions
  if (!hasRole(userProfile.role, ['business_analyst', 'promaster'])) {
    return {
      status: 403,
      headers: corsHeaders,
      jsonBody: { error: 'Insufficient permissions' },
    };
  }

  const body = await request.json() as any;
  const validatedData = validateProcessInput(body);

  const result = await query(
    `UPDATE processes SET
      process_name = COALESCE($1, process_name),
      process_unique_id = COALESCE($2, process_unique_id),
      owner_username = COALESCE($3, owner_username),
      input_processes = COALESCE($4, input_processes),
      output_processes = COALESCE($5, output_processes),
      canvas_position = COALESCE($6, canvas_position),
      metadata = COALESCE($7, metadata),
      regions = COALESCE($8, regions),
      modified_by = $9,
      modified_date = NOW()
    WHERE id = $10
    RETURNING *`,
    [
      validatedData.process_name,
      validatedData.process_unique_id,
      validatedData.owner_username,
      validatedData.input_processes,
      validatedData.output_processes,
      validatedData.canvas_position,
      validatedData.metadata,
      validatedData.regions,
      userProfile.email,
      id,
    ]
  );

  if (result.rows.length === 0) {
    return {
      status: 404,
      headers: corsHeaders,
      jsonBody: { error: 'Process not found' },
    };
  }

  return {
    status: 200,
    headers: corsHeaders,
    jsonBody: { data: result.rows[0] },
  };
}

/**
 * Handle DELETE request - Delete process
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
      jsonBody: { error: 'Process ID is required' },
    };
  }

  if (!isValidUUID(id)) {
    return {
      status: 400,
      headers: corsHeaders,
      jsonBody: { error: 'Invalid process ID format' },
    };
  }

  // Check permissions
  if (!hasRole(userProfile.role, ['business_analyst', 'promaster'])) {
    return {
      status: 403,
      headers: corsHeaders,
      jsonBody: { error: 'Insufficient permissions' },
    };
  }

  const result = await query('DELETE FROM processes WHERE id = $1 RETURNING id', [id]);

  if (result.rows.length === 0) {
    return {
      status: 404,
      headers: corsHeaders,
      jsonBody: { error: 'Process not found' },
    };
  }

  return {
    status: 200,
    headers: corsHeaders,
    jsonBody: { success: true },
  };
}

// Register the function
app.http('processes', {
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  authLevel: 'anonymous',
  handler: processesFunction,
});
