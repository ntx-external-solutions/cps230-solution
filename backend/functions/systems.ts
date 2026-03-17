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
import { validateSystemInput, ValidationError, isValidUUID } from '../shared/validation';

/**
 * Systems HTTP trigger function
 * Handles CRUD operations for systems
 */
export async function systemsFunction(
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
    context.error('Error in systems function:', error);

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
 * Handle GET request - Retrieve system(s)
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
        jsonBody: { error: 'Invalid system ID format' },
      };
    }

    // Get single system with related data
    const systemResult = await query(
      'SELECT * FROM systems WHERE id = $1',
      [id]
    );

    if (systemResult.rows.length === 0) {
      return {
        status: 404,
        headers: corsHeaders,
        jsonBody: { error: 'System not found' },
      };
    }

    const system = systemResult.rows[0];

    // Get associated processes via process_systems
    const processesResult = await query(
      `SELECT p.id, p.process_name, ps.process_step, ps.activity_description
       FROM processes p
       INNER JOIN process_systems ps ON ps.process_id = p.id
       WHERE ps.system_id = $1`,
      [id]
    );

    // Get associated critical operations
    const criticalOpsResult = await query(
      'SELECT id, operation_name FROM critical_operations WHERE system_id = $1',
      [id]
    );

    // Get associated controls
    const controlsResult = await query(
      'SELECT id, control_name FROM controls WHERE system_id = $1',
      [id]
    );

    return {
      status: 200,
      headers: corsHeaders,
      jsonBody: {
        data: {
          ...system,
          processes: processesResult.rows,
          criticalOperations: criticalOpsResult.rows,
          controls: controlsResult.rows,
        },
      },
    };
  } else {
    // Get all systems
    const systemsResult = await query(
      'SELECT * FROM systems ORDER BY system_name ASC'
    );

    return {
      status: 200,
      headers: corsHeaders,
      jsonBody: { data: systemsResult.rows },
    };
  }
}

/**
 * Handle POST request - Create new system
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
      jsonBody: { error: 'Insufficient permissions. Only Promasters can create systems.' },
    };
  }

  const body = await request.json() as any;
  const validatedData = validateSystemInput(body);

  const result = await query(
    `INSERT INTO systems (
      system_name, system_id, description, metadata, modified_by
    ) VALUES ($1, $2, $3, $4, $5)
    RETURNING *`,
    [
      validatedData.system_name,
      validatedData.system_id,
      validatedData.description || null,
      validatedData.metadata || null,
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
 * Handle PUT/PATCH request - Update system
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
      jsonBody: { error: 'System ID is required' },
    };
  }

  if (!isValidUUID(id)) {
    return {
      status: 400,
      headers: corsHeaders,
      jsonBody: { error: 'Invalid system ID format' },
    };
  }

  // Check permissions - only promasters can modify
  if (!hasRole(userProfile.role, ['promaster'])) {
    return {
      status: 403,
      headers: corsHeaders,
      jsonBody: { error: 'Insufficient permissions. Only Promasters can update systems.' },
    };
  }

  const body = await request.json() as any;
  const validatedData = validateSystemInput(body);

  const result = await query(
    `UPDATE systems SET
      system_name = COALESCE($1, system_name),
      system_id = COALESCE($2, system_id),
      description = COALESCE($3, description),
      metadata = COALESCE($4, metadata),
      modified_by = $5,
      modified_date = NOW()
    WHERE id = $6
    RETURNING *`,
    [
      validatedData.system_name,
      validatedData.system_id,
      validatedData.description,
      validatedData.metadata,
      userProfile.email,
      id,
    ]
  );

  if (result.rows.length === 0) {
    return {
      status: 404,
      headers: corsHeaders,
      jsonBody: { error: 'System not found' },
    };
  }

  return {
    status: 200,
    headers: corsHeaders,
    jsonBody: { data: result.rows[0] },
  };
}

/**
 * Handle DELETE request - Delete system
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
      jsonBody: { error: 'System ID is required' },
    };
  }

  if (!isValidUUID(id)) {
    return {
      status: 400,
      headers: corsHeaders,
      jsonBody: { error: 'Invalid system ID format' },
    };
  }

  // Check permissions - only promasters can modify
  if (!hasRole(userProfile.role, ['promaster'])) {
    return {
      status: 403,
      headers: corsHeaders,
      jsonBody: { error: 'Insufficient permissions. Only Promasters can delete systems.' },
    };
  }

  const result = await query('DELETE FROM systems WHERE id = $1 RETURNING id', [id]);

  if (result.rows.length === 0) {
    return {
      status: 404,
      headers: corsHeaders,
      jsonBody: { error: 'System not found' },
    };
  }

  return {
    status: 200,
    headers: corsHeaders,
    jsonBody: { success: true },
  };
}

// Register the function
app.http('systems', {
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  authLevel: 'anonymous',
  handler: systemsFunction,
});
