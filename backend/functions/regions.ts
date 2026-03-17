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
 * Regions HTTP trigger function
 * Handles CRUD operations for geographic regions
 */
export async function regionsFunction(
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
        return await handleGet(id, corsHeaders, context);

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
    context.error('Error in regions function:', error);

    const status = error.message?.includes('Token') || error.message?.includes('Authorization') || error.message?.includes('Authentication')
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
 * Handle GET request - Retrieve region(s)
 */
async function handleGet(
  id: string | null,
  corsHeaders: Record<string, string>,
  context: InvocationContext
): Promise<HttpResponseInit> {
  if (id) {
    // Validate UUID
    if (!isValidUUID(id)) {
      return {
        status: 400,
        headers: corsHeaders,
        jsonBody: { error: 'Invalid region ID format' },
      };
    }

    // Get single region
    const result = await query(
      'SELECT * FROM regions WHERE id = $1',
      [id]
    );

    if (result.rows.length === 0) {
      return {
        status: 404,
        headers: corsHeaders,
        jsonBody: { error: 'Region not found' },
      };
    }

    return {
      status: 200,
      headers: corsHeaders,
      jsonBody: { data: result.rows[0] },
    };
  } else {
    // Get all regions (RLS will filter based on user role)
    const result = await query(
      'SELECT * FROM regions ORDER BY region_code ASC'
    );

    return {
      status: 200,
      headers: corsHeaders,
      jsonBody: { data: result.rows },
    };
  }
}

/**
 * Handle POST request - Create new region
 */
async function handlePost(
  request: HttpRequest,
  userProfile: any,
  corsHeaders: Record<string, string>,
  context: InvocationContext
): Promise<HttpResponseInit> {
  // Check permissions - only promasters can create regions
  if (!hasRole(userProfile.role, ['promaster'])) {
    return {
      status: 403,
      headers: corsHeaders,
      jsonBody: { error: 'Insufficient permissions. Only Promasters can create regions.' },
    };
  }

  const body = await request.json() as any;

  if (!body.region_code) {
    return {
      status: 400,
      headers: corsHeaders,
      jsonBody: { error: 'region_code is required' },
    };
  }

  const result = await query(
    `INSERT INTO regions (
      region_code, region_name, description, modified_by
    ) VALUES ($1, $2, $3, $4)
    RETURNING *`,
    [
      body.region_code,
      body.region_name || null,
      body.description || null,
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
 * Handle PUT/PATCH request - Update region
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
      jsonBody: { error: 'Region ID is required' },
    };
  }

  if (!isValidUUID(id)) {
    return {
      status: 400,
      headers: corsHeaders,
      jsonBody: { error: 'Invalid region ID format' },
    };
  }

  // Check permissions - only promasters can update regions
  if (!hasRole(userProfile.role, ['promaster'])) {
    return {
      status: 403,
      headers: corsHeaders,
      jsonBody: { error: 'Insufficient permissions. Only Promasters can update regions.' },
    };
  }

  const body = await request.json() as any;

  const result = await query(
    `UPDATE regions SET
      region_name = COALESCE($1, region_name),
      description = COALESCE($2, description),
      modified_by = $3,
      modified_date = NOW()
    WHERE id = $4
    RETURNING *`,
    [
      body.region_name,
      body.description,
      userProfile.email,
      id,
    ]
  );

  if (result.rows.length === 0) {
    return {
      status: 404,
      headers: corsHeaders,
      jsonBody: { error: 'Region not found' },
    };
  }

  return {
    status: 200,
    headers: corsHeaders,
    jsonBody: { data: result.rows[0] },
  };
}

/**
 * Handle DELETE request - Delete region
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
      jsonBody: { error: 'Region ID is required' },
    };
  }

  if (!isValidUUID(id)) {
    return {
      status: 400,
      headers: corsHeaders,
      jsonBody: { error: 'Invalid region ID format' },
    };
  }

  // Check permissions - only promasters can delete regions
  if (!hasRole(userProfile.role, ['promaster'])) {
    return {
      status: 403,
      headers: corsHeaders,
      jsonBody: { error: 'Insufficient permissions. Only Promasters can delete regions.' },
    };
  }

  const result = await query('DELETE FROM regions WHERE id = $1 RETURNING id', [id]);

  if (result.rows.length === 0) {
    return {
      status: 404,
      headers: corsHeaders,
      jsonBody: { error: 'Region not found' },
    };
  }

  return {
    status: 200,
    headers: corsHeaders,
    jsonBody: { success: true },
  };
}

// Register the function
app.http('regions', {
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  authLevel: 'anonymous',
  handler: regionsFunction,
});
