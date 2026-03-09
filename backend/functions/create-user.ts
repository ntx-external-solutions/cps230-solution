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
import { validateUserProfileInput, ValidationError } from '../shared/validation';

/**
 * Create User HTTP trigger function
 * Special endpoint for creating or upserting user profiles
 * This is typically called after Azure AD SSO authentication
 */
export async function createUserFunction(
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

  // Only POST method is allowed
  if (request.method !== 'POST') {
    return {
      status: 405,
      headers: corsHeaders,
      jsonBody: { error: 'Method not allowed. Only POST is supported.' },
    };
  }

  try {
    // Authenticate user
    const userProfile = await authenticateRequestUnified(request);

    // Set session context for RLS
    const pool = getPool();
    await setSessionContext(pool, userProfile.azureAdObjectId, userProfile.role, userProfile.accountId);

    const body = await request.json() as any;

    // Validate input
    const validatedData = validateUserProfileInput(body);

    // Check if this is a self-registration or admin creating a user
    const isSelfRegistration = validatedData.azure_ad_object_id === userProfile.azureAdObjectId;
    const isAdminCreatingUser = hasRole(userProfile.role, ['promaster']) && !isSelfRegistration;

    // Ensure required fields
    if (!validatedData.azure_ad_object_id || !validatedData.email) {
      return {
        status: 400,
        headers: corsHeaders,
        jsonBody: { error: 'azure_ad_object_id and email are required' },
      };
    }

    // Check if user already exists
    const existingUser = await query(
      'SELECT id, role FROM user_profiles WHERE azure_ad_object_id = $1',
      [validatedData.azure_ad_object_id]
    );

    if (existingUser.rows.length > 0) {
      // User exists, update profile (upsert pattern)
      const updates: string[] = [];
      const params: any[] = [];
      let paramIndex = 1;

      if (validatedData.email) {
        updates.push(`email = $${paramIndex}`);
        params.push(validatedData.email);
        paramIndex++;
      }

      if (validatedData.full_name) {
        updates.push(`full_name = $${paramIndex}`);
        params.push(validatedData.full_name);
        paramIndex++;
      }

      // Only allow role updates if admin is creating/updating the user
      if (validatedData.role && isAdminCreatingUser) {
        updates.push(`role = $${paramIndex}`);
        params.push(validatedData.role);
        paramIndex++;
      }

      updates.push(`updated_at = NOW()`);
      params.push(validatedData.azure_ad_object_id);

      const queryStr = `UPDATE user_profiles SET ${updates.join(', ')} WHERE azure_ad_object_id = $${paramIndex} RETURNING id, azure_ad_object_id, email, full_name, role, created_at, updated_at`;

      const result = await query(queryStr, params);

      return {
        status: 200,
        headers: corsHeaders,
        jsonBody: {
          data: result.rows[0],
          message: 'User profile updated',
        },
      };
    } else {
      // Create new user
      // For self-registration, default role is 'user'
      // For admin creation, use the specified role or default to 'user'
      const role = isAdminCreatingUser && validatedData.role
        ? validatedData.role
        : 'user';

      const result = await query(
        `INSERT INTO user_profiles (
          azure_ad_object_id, email, full_name, role
        ) VALUES ($1, $2, $3, $4)
        RETURNING id, azure_ad_object_id, email, full_name, role, created_at, updated_at`,
        [
          validatedData.azure_ad_object_id,
          validatedData.email,
          validatedData.full_name || null,
          role,
        ]
      );

      return {
        status: 201,
        headers: corsHeaders,
        jsonBody: {
          data: result.rows[0],
          message: 'User profile created',
        },
      };
    }
  } catch (error: any) {
    context.error('Error in create-user function:', error);

    const status = error instanceof ValidationError
      ? 400
      : error.message?.includes('Token') || error.message?.includes('Authorization') || error.message?.includes('Authentication')
      ? 401
      : error.message?.includes('permission') || error.message?.includes('role')
      ? 403
      : error.code === '23505' // PostgreSQL unique violation
      ? 409
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

// Register the function
app.http('create-user', {
  methods: ['POST', 'OPTIONS'],
  authLevel: 'anonymous',
  handler: createUserFunction,
});
