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
import { validateControlInput, ValidationError, isValidUUID } from '../shared/validation';

/**
 * Controls HTTP trigger function
 * Handles CRUD operations for controls
 */
export async function controlsFunction(
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
    context.error('Error in controls function:', error);

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
 * Handle GET request - Retrieve control(s)
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
        jsonBody: { error: 'Invalid control ID format' },
      };
    }

    // Get single control with related data
    const controlResult = await query(
      `SELECT c.*,
              co.operation_name as critical_operation_name,
              p.process_name,
              s.system_name
       FROM controls c
       LEFT JOIN critical_operations co ON c.critical_operation_id = co.id
       LEFT JOIN processes p ON c.process_id = p.id
       LEFT JOIN systems s ON c.system_id = s.id
       WHERE c.id = $1`,
      [id]
    );

    if (controlResult.rows.length === 0) {
      return {
        status: 404,
        headers: corsHeaders,
        jsonBody: { error: 'Control not found' },
      };
    }

    const control = controlResult.rows[0];

    // Get associated processes via process_controls junction table
    const processesResult = await query(
      `SELECT p.id, p.process_name, pc.process_step, pc.activity_description
       FROM processes p
       INNER JOIN process_controls pc ON pc.process_id = p.id
       WHERE pc.control_id = $1`,
      [id]
    );

    return {
      status: 200,
      headers: corsHeaders,
      jsonBody: {
        data: {
          ...control,
          associatedProcesses: processesResult.rows,
        },
      },
    };
  } else {
    // Get all controls
    const controlsResult = await query(
      `SELECT c.*,
              co.operation_name as critical_operation_name,
              p.process_name,
              s.system_name
       FROM controls c
       LEFT JOIN critical_operations co ON c.critical_operation_id = co.id
       LEFT JOIN processes p ON c.process_id = p.id
       LEFT JOIN systems s ON c.system_id = s.id
       ORDER BY c.control_name ASC`
    );

    return {
      status: 200,
      headers: corsHeaders,
      jsonBody: { data: controlsResult.rows },
    };
  }
}

/**
 * Handle POST request - Create new control
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
      jsonBody: { error: 'Insufficient permissions. Only Promasters can create controls.' },
    };
  }

  const body = await request.json() as any;
  const validatedData = validateControlInput(body);

  const result = await query(
    `INSERT INTO controls (
      control_name, description, critical_operation_id, process_id,
      system_id, regions, control_type, pm_control_id, modified_by
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    RETURNING *`,
    [
      validatedData.control_name,
      validatedData.description || null,
      validatedData.critical_operation_id || null,
      validatedData.process_id || null,
      validatedData.system_id || null,
      validatedData.regions || [],
      validatedData.control_type || null,
      validatedData.pm_control_id || null,
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
 * Handle PUT/PATCH request - Update control
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
      jsonBody: { error: 'Control ID is required' },
    };
  }

  if (!isValidUUID(id)) {
    return {
      status: 400,
      headers: corsHeaders,
      jsonBody: { error: 'Invalid control ID format' },
    };
  }

  // Check permissions - only promasters can modify
  if (!hasRole(userProfile.role, ['promaster'])) {
    return {
      status: 403,
      headers: corsHeaders,
      jsonBody: { error: 'Insufficient permissions. Only Promasters can update controls.' },
    };
  }

  const body = await request.json() as any;
  const validatedData = validateControlInput(body);

  const result = await query(
    `UPDATE controls SET
      control_name = COALESCE($1, control_name),
      description = COALESCE($2, description),
      critical_operation_id = COALESCE($3, critical_operation_id),
      process_id = COALESCE($4, process_id),
      system_id = COALESCE($5, system_id),
      regions = COALESCE($6, regions),
      control_type = COALESCE($7, control_type),
      pm_control_id = COALESCE($8, pm_control_id),
      modified_by = $9,
      modified_date = NOW()
    WHERE id = $10
    RETURNING *`,
    [
      validatedData.control_name,
      validatedData.description,
      validatedData.critical_operation_id,
      validatedData.process_id,
      validatedData.system_id,
      validatedData.regions,
      validatedData.control_type,
      validatedData.pm_control_id,
      userProfile.email,
      id,
    ]
  );

  if (result.rows.length === 0) {
    return {
      status: 404,
      headers: corsHeaders,
      jsonBody: { error: 'Control not found' },
    };
  }

  return {
    status: 200,
    headers: corsHeaders,
    jsonBody: { data: result.rows[0] },
  };
}

/**
 * Handle DELETE request - Delete control
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
      jsonBody: { error: 'Control ID is required' },
    };
  }

  if (!isValidUUID(id)) {
    return {
      status: 400,
      headers: corsHeaders,
      jsonBody: { error: 'Invalid control ID format' },
    };
  }

  // Check permissions - only promasters can modify
  if (!hasRole(userProfile.role, ['promaster'])) {
    return {
      status: 403,
      headers: corsHeaders,
      jsonBody: { error: 'Insufficient permissions. Only Promasters can delete controls.' },
    };
  }

  const result = await query('DELETE FROM controls WHERE id = $1 RETURNING id', [id]);

  if (result.rows.length === 0) {
    return {
      status: 404,
      headers: corsHeaders,
      jsonBody: { error: 'Control not found' },
    };
  }

  return {
    status: 200,
    headers: corsHeaders,
    jsonBody: { success: true },
  };
}

// Register the function
app.http('controls', {
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  authLevel: 'anonymous',
  handler: controlsFunction,
});
