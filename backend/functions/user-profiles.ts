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
import { validateUserProfileInput, ValidationError, isValidUUID } from '../shared/validation';

/**
 * User Profiles HTTP trigger function
 * Handles CRUD operations for user profiles
 */
export async function userProfilesFunction(
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
    context.error('Error in user-profiles function:', error);

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
 * Handle GET request - Retrieve user profile(s)
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
        jsonBody: { error: 'Invalid user ID format' },
      };
    }

    // Check permissions - users can only view their own profile unless they're promaster
    const result = await query(
      'SELECT id, azure_ad_object_id, email, full_name, role, created_at, updated_at FROM user_profiles WHERE id = $1',
      [id]
    );

    if (result.rows.length === 0) {
      return {
        status: 404,
        headers: corsHeaders,
        jsonBody: { error: 'User profile not found' },
      };
    }

    const profile = result.rows[0];

    // Check if user can view this profile
    if (profile.azure_ad_object_id !== userProfile.azureAdObjectId && !hasRole(userProfile.role, ['promaster'])) {
      return {
        status: 403,
        headers: corsHeaders,
        jsonBody: { error: 'Insufficient permissions to view this profile' },
      };
    }

    return {
      status: 200,
      headers: corsHeaders,
      jsonBody: { data: profile },
    };
  } else {
    // Only promasters can view all profiles
    if (!hasRole(userProfile.role, ['promaster'])) {
      return {
        status: 403,
        headers: corsHeaders,
        jsonBody: { error: 'Insufficient permissions. Only Promasters can view all user profiles.' },
      };
    }

    // Get all user profiles
    const result = await query(
      'SELECT id, azure_ad_object_id, email, full_name, role, created_at, updated_at FROM user_profiles ORDER BY email ASC'
    );

    return {
      status: 200,
      headers: corsHeaders,
      jsonBody: { data: result.rows },
    };
  }
}

/**
 * Handle POST request - Create new user profile
 */
async function handlePost(
  request: HttpRequest,
  userProfile: any,
  corsHeaders: Record<string, string>,
  context: InvocationContext
): Promise<HttpResponseInit> {
  // Check permissions - only promasters can create users
  if (!hasRole(userProfile.role, ['promaster'])) {
    return {
      status: 403,
      headers: corsHeaders,
      jsonBody: { error: 'Insufficient permissions. Only Promasters can create user profiles.' },
    };
  }

  const body = await request.json() as any;
  const validatedData = validateUserProfileInput(body);

  // Ensure required fields for creation
  if (!validatedData.azure_ad_object_id || !validatedData.email) {
    return {
      status: 400,
      headers: corsHeaders,
      jsonBody: { error: 'azure_ad_object_id and email are required for user creation' },
    };
  }

  const result = await query(
    `INSERT INTO user_profiles (
      azure_ad_object_id, email, full_name, role
    ) VALUES ($1, $2, $3, $4)
    RETURNING id, azure_ad_object_id, email, full_name, role, created_at, updated_at`,
    [
      validatedData.azure_ad_object_id,
      validatedData.email,
      validatedData.full_name || null,
      validatedData.role || 'user',
    ]
  );

  return {
    status: 201,
    headers: corsHeaders,
    jsonBody: { data: result.rows[0] },
  };
}

/**
 * Handle PUT/PATCH request - Update user profile
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
      jsonBody: { error: 'User ID is required' },
    };
  }

  if (!isValidUUID(id)) {
    return {
      status: 400,
      headers: corsHeaders,
      jsonBody: { error: 'Invalid user ID format' },
    };
  }

  // Check permissions - only promasters can update user profiles
  if (!hasRole(userProfile.role, ['promaster'])) {
    return {
      status: 403,
      headers: corsHeaders,
      jsonBody: { error: 'Insufficient permissions. Only Promasters can update user profiles.' },
    };
  }

  const body = await request.json() as any;
  const validatedData = validateUserProfileInput(body);

  const result = await query(
    `UPDATE user_profiles SET
      email = COALESCE($1, email),
      full_name = COALESCE($2, full_name),
      role = COALESCE($3, role),
      updated_at = NOW()
    WHERE id = $4
    RETURNING id, azure_ad_object_id, email, full_name, role, created_at, updated_at`,
    [
      validatedData.email,
      validatedData.full_name,
      validatedData.role,
      id,
    ]
  );

  if (result.rows.length === 0) {
    return {
      status: 404,
      headers: corsHeaders,
      jsonBody: { error: 'User profile not found' },
    };
  }

  return {
    status: 200,
    headers: corsHeaders,
    jsonBody: { data: result.rows[0] },
  };
}

/**
 * Handle DELETE request - Delete user profile
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
      jsonBody: { error: 'User ID is required' },
    };
  }

  if (!isValidUUID(id)) {
    return {
      status: 400,
      headers: corsHeaders,
      jsonBody: { error: 'Invalid user ID format' },
    };
  }

  // Check permissions - only promasters can delete user profiles
  if (!hasRole(userProfile.role, ['promaster'])) {
    return {
      status: 403,
      headers: corsHeaders,
      jsonBody: { error: 'Insufficient permissions. Only Promasters can delete user profiles.' },
    };
  }

  // Prevent deletion of own profile
  const profileToDelete = await query('SELECT azure_ad_object_id FROM user_profiles WHERE id = $1', [id]);

  if (profileToDelete.rows.length > 0 && profileToDelete.rows[0].azure_ad_object_id === userProfile.azureAdObjectId) {
    return {
      status: 400,
      headers: corsHeaders,
      jsonBody: { error: 'Cannot delete your own profile' },
    };
  }

  const result = await query('DELETE FROM user_profiles WHERE id = $1 RETURNING id', [id]);

  if (result.rows.length === 0) {
    return {
      status: 404,
      headers: corsHeaders,
      jsonBody: { error: 'User profile not found' },
    };
  }

  return {
    status: 200,
    headers: corsHeaders,
    jsonBody: { success: true },
  };
}

// Register the function
app.http('user-profiles', {
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  authLevel: 'anonymous',
  handler: userProfilesFunction,
});
