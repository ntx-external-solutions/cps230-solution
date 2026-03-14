import {
  app,
  HttpRequest,
  HttpResponseInit,
  InvocationContext,
} from '@azure/functions';
import { getCorsHeaders } from '../shared/auth';
import { query, getPool, setSessionContext } from '../shared/database';
import { hashPassword, comparePassword, validatePasswordStrength } from '../shared/password';
import { generateLocalUserToken } from '../shared/jwt';
import { validateUserProfileInput } from '../shared/validation';

/**
 * Local User Login
 * Authenticates users with email/password stored in database
 */
export async function localLogin(
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
    const body = await request.json() as any;

    // Validate input
    if (!body.email || !body.password) {
      return {
        status: 400,
        headers: corsHeaders,
        jsonBody: {
          error: 'Email and password are required',
        },
      };
    }

    // Find user by email
    const result = await query(
      `SELECT id, email, full_name, role, password_hash, auth_type
       FROM user_profiles
       WHERE email = $1 AND auth_type = 'local'`,
      [body.email.toLowerCase()]
    );

    if (result.rows.length === 0) {
      return {
        status: 401,
        headers: corsHeaders,
        jsonBody: {
          error: 'Invalid email or password',
        },
      };
    }

    const user = result.rows[0];

    // Verify password
    const isValidPassword = await comparePassword(body.password, user.password_hash);

    if (!isValidPassword) {
      return {
        status: 401,
        headers: corsHeaders,
        jsonBody: {
          error: 'Invalid email or password',
        },
      };
    }

    // Generate JWT token
    const token = generateLocalUserToken({
      userId: user.id,
      email: user.email,
      role: user.role,
      authType: 'local',
    });

    context.log('Local user logged in:', user.email);

    return {
      status: 200,
      headers: corsHeaders,
      jsonBody: {
        token,
        user: {
          id: user.id,
          email: user.email,
          full_name: user.full_name,
          role: user.role,
          auth_type: 'local',
        },
      },
    };
  } catch (error: any) {
    context.error('Error in local login:', error);

    return {
      status: 500,
      headers: corsHeaders,
      jsonBody: {
        error: 'An error occurred during login',
        details: error.message,
      },
    };
  }
}

/**
 * Create Local User (Admin Only)
 * Allows Promaster users to create new local users
 */
export async function createLocalUser(
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
    const body = await request.json() as any;

    // Check if this is the first user (allow unauthenticated creation)
    const userCountResult = await query('SELECT COUNT(*) as count FROM user_profiles');
    const userCount = parseInt(userCountResult.rows[0].count);

    // If users exist, require promaster authentication
    if (userCount > 0) {
      const { authenticateRequestUnified, hasRole } = await import('../shared/auth');

      try {
        const userProfile = await authenticateRequestUnified(request);

        if (!hasRole(userProfile.role, ['promaster'])) {
          return {
            status: 403,
            headers: corsHeaders,
            jsonBody: { error: 'Only Promasters can create users' },
          };
        }
      } catch (authError: any) {
        return {
          status: 401,
          headers: corsHeaders,
          jsonBody: { error: 'Authentication required to create users', details: authError.message },
        };
      }
    }

    // Validate required fields
    if (!body.email || !body.password) {
      return {
        status: 400,
        headers: corsHeaders,
        jsonBody: {
          error: 'Email and password are required',
        },
      };
    }

    // Normalize email
    const email = body.email.toLowerCase();

    // Check if user already exists
    const existingUser = await query(
      'SELECT id, email, auth_type, azure_ad_object_id FROM user_profiles WHERE email = $1',
      [email]
    );

    if (existingUser.rows.length > 0) {
      const user = existingUser.rows[0];

      // If user has Azure AD linked, suggest using SSO
      if (user.azure_ad_object_id) {
        return {
          status: 409,
          headers: corsHeaders,
          jsonBody: {
            error: 'User with this email already exists and is linked to Azure AD SSO',
            message: 'This email address is already registered. Please use the "Sign In with Microsoft" option to login.',
            authType: 'azure_sso',
          },
        };
      }

      // Local user already exists
      return {
        status: 409,
        headers: corsHeaders,
        jsonBody: {
          error: 'User with this email already exists',
          message: 'A user with this email address has already been created.',
        },
      };
    }

    // Validate password strength
    const passwordValidation = validatePasswordStrength(body.password);
    if (!passwordValidation.valid) {
      return {
        status: 400,
        headers: corsHeaders,
        jsonBody: {
          error: 'Password does not meet requirements',
          details: passwordValidation.errors,
        },
      };
    }

    // Hash password
    const passwordHash = await hashPassword(body.password);

    // Create user
    const result = await query(
      `INSERT INTO user_profiles (
        email, full_name, role, password_hash, auth_type
      ) VALUES ($1, $2, $3, $4, 'local')
      RETURNING id, email, full_name, role, auth_type, created_at`,
      [
        email,
        body.full_name || null,
        body.role || 'user',
        passwordHash,
      ]
    );

    const newUser = result.rows[0];

    context.log('Local user created:', newUser.email);

    return {
      status: 201,
      headers: corsHeaders,
      jsonBody: {
        data: {
          id: newUser.id,
          email: newUser.email,
          full_name: newUser.full_name,
          role: newUser.role,
          auth_type: newUser.auth_type,
          created_at: newUser.created_at,
        },
        message: 'User created successfully',
      },
    };
  } catch (error: any) {
    context.error('Error creating local user:', error);

    return {
      status: 500,
      headers: corsHeaders,
      jsonBody: {
        error: 'Failed to create user',
        details: error.message,
      },
    };
  }
}

/**
 * Reset Local User Password (Admin Only)
 */
export async function resetLocalUserPassword(
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
    // SECURITY: Only promasters can reset passwords
    const { authenticateRequestUnified, hasRole } = await import('../shared/auth');

    try {
      const userProfile = await authenticateRequestUnified(request);

      if (!hasRole(userProfile.role, ['promaster'])) {
        return {
          status: 403,
          headers: corsHeaders,
          jsonBody: { error: 'Only Promasters can reset passwords' },
        };
      }
    } catch (authError: any) {
      return {
        status: 401,
        headers: corsHeaders,
        jsonBody: { error: 'Authentication required to reset passwords', details: authError.message },
      };
    }

    const userId = request.params.userId;
    const body = await request.json() as any;

    if (!userId || !body.newPassword) {
      return {
        status: 400,
        headers: corsHeaders,
        jsonBody: {
          error: 'User ID and new password are required',
        },
      };
    }

    // Validate password strength
    const passwordValidation = validatePasswordStrength(body.newPassword);
    if (!passwordValidation.valid) {
      return {
        status: 400,
        headers: corsHeaders,
        jsonBody: {
          error: 'Password does not meet requirements',
          details: passwordValidation.errors,
        },
      };
    }

    // Hash new password
    const passwordHash = await hashPassword(body.newPassword);

    // Update user password
    const result = await query(
      `UPDATE user_profiles
       SET password_hash = $1, updated_at = NOW()
       WHERE id = $2 AND auth_type = 'local'
       RETURNING id, email`,
      [passwordHash, userId]
    );

    if (result.rows.length === 0) {
      return {
        status: 404,
        headers: corsHeaders,
        jsonBody: {
          error: 'Local user not found',
        },
      };
    }

    context.log('Password reset for user:', result.rows[0].email);

    return {
      status: 200,
      headers: corsHeaders,
      jsonBody: {
        message: 'Password reset successfully',
      },
    };
  } catch (error: any) {
    context.error('Error resetting password:', error);

    return {
      status: 500,
      headers: corsHeaders,
      jsonBody: {
          error: 'Failed to reset password',
        details: error.message,
      },
    };
  }
}

// Register functions
app.http('auth-local-login', {
  methods: ['POST', 'OPTIONS'],
  authLevel: 'anonymous',
  route: 'auth/local/login',
  handler: localLogin,
});

app.http('auth-local-create-user', {
  methods: ['POST', 'OPTIONS'],
  authLevel: 'anonymous',
  route: 'auth/local/users',
  handler: createLocalUser,
});

app.http('auth-local-reset-password', {
  methods: ['PATCH', 'OPTIONS'],
  authLevel: 'anonymous',
  route: 'auth/local/users/{userId}/reset-password',
  handler: resetLocalUserPassword,
});
