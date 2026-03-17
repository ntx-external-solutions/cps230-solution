import { HttpRequest, InvocationContext } from '@azure/functions';
import jwt from 'jsonwebtoken';
import jwksClient from 'jwks-rsa';
import { query } from './database';
import { verifyLocalUserToken, LocalUserTokenPayload } from './jwt';

// JWT verification client for Azure AD
let jwksClientInstance: jwksClient.JwksClient | null = null;

/**
 * Get or create JWKS client for Azure AD
 */
function getJwksClient(): jwksClient.JwksClient {
  if (!jwksClientInstance) {
    const tenantId = process.env.AZURE_TENANT_ID;

    if (!tenantId) {
      throw new Error('AZURE_TENANT_ID environment variable is not set');
    }

    const jwksUri = `https://login.microsoftonline.com/${tenantId}/discovery/v2.0/keys`;

    jwksClientInstance = jwksClient({
      jwksUri,
      cache: true,
      cacheMaxAge: 3600000, // 1 hour
    });
  }

  return jwksClientInstance;
}

/**
 * Get signing key from JWKS endpoint
 */
function getSigningKey(header: jwt.JwtHeader): Promise<string> {
  return new Promise((resolve, reject) => {
    const client = getJwksClient();

    client.getSigningKey(header.kid, (err, key) => {
      if (err) {
        reject(err);
        return;
      }

      const signingKey = key?.getPublicKey();
      resolve(signingKey || '');
    });
  });
}

/**
 * Decoded token payload interface
 */
export interface DecodedToken {
  oid: string; // Object ID (Azure AD user ID)
  sub: string; // Subject
  email?: string;
  emails?: string[];
  name?: string;
  given_name?: string;
  family_name?: string;
  exp: number;
  iat: number;
  aud: string;
  iss: string;
}

/**
 * User profile with role
 */
export interface UserProfile {
  id: string;
  azureAdObjectId?: string;  // Optional for local users
  email: string;
  fullName?: string;
  role: 'user' | 'business_analyst' | 'promaster';
  authType: 'azure_sso' | 'local';
}

/**
 * Verify Azure AD token
 * @param token JWT token from Authorization header
 * @returns Decoded token payload
 */
export async function verifyToken(token: string): Promise<DecodedToken> {
  const clientId = process.env.AZURE_CLIENT_ID;
  const tenantId = process.env.AZURE_TENANT_ID;

  if (!clientId || !tenantId) {
    throw new Error('Azure AD configuration is incomplete');
  }

  // Decode token without verification to see claims for debugging
  const decoded = jwt.decode(token, { complete: true });
  console.log('Token verification attempt:', {
    expectedAudience: clientId,
    expectedIssuer: `https://login.microsoftonline.com/${tenantId}/v2.0`,
    actualAudience: (decoded?.payload as any)?.aud,
    actualIssuer: (decoded?.payload as any)?.iss,
    kid: decoded?.header?.kid,
  });

  return new Promise((resolve, reject) => {
    jwt.verify(
      token,
      async (header, callback) => {
        try {
          const key = await getSigningKey(header);
          callback(null, key);
        } catch (err) {
          console.error('Error getting signing key:', err);
          callback(err as Error);
        }
      },
      {
        audience: clientId,
        issuer: `https://login.microsoftonline.com/${tenantId}/v2.0`,
        algorithms: ['RS256'],
      },
      (err, decoded) => {
        if (err) {
          console.error('JWT verification error:', err.message);
          reject(err);
        } else {
          console.log('JWT verification successful');
          resolve(decoded as DecodedToken);
        }
      }
    );
  });
}

/**
 * Extract and verify Bearer token from Authorization header
 * Supports both Azure AD tokens and local JWT tokens
 * @param request HTTP request
 * @returns Decoded token (Azure AD) or throws for local users (use authenticateRequestUnified)
 */
export async function authenticateRequest(request: HttpRequest): Promise<DecodedToken> {
  const authHeader = request.headers.get('Authorization');

  if (!authHeader) {
    throw new Error('Missing Authorization header');
  }

  const parts = authHeader.split(' ');

  if (parts.length !== 2 || parts[0].toLowerCase() !== 'bearer') {
    throw new Error('Invalid Authorization header format. Expected: Bearer <token>');
  }

  const token = parts[1];

  try {
    return await verifyToken(token);
  } catch (error: any) {
    throw new Error(`Token verification failed: ${error.message}`);
  }
}

/**
 * Unified authentication that supports both Azure AD and local JWT tokens
 * @param request HTTP request
 * @returns User profile
 */
export async function authenticateRequestUnified(request: HttpRequest): Promise<UserProfile> {
  const authHeader = request.headers.get('Authorization');

  if (!authHeader) {
    throw new Error('Missing Authorization header');
  }

  const parts = authHeader.split(' ');

  if (parts.length !== 2 || parts[0].toLowerCase() !== 'bearer') {
    throw new Error('Invalid Authorization header format. Expected: Bearer <token>');
  }

  const token = parts[1];

  // Try local JWT token first (faster)
  try {
    const localPayload = verifyLocalUserToken(token);

    // Get user from database to ensure they still exist and have a password hash
    const result = await query(
      `SELECT id, email, full_name, role, auth_type, password_hash
       FROM user_profiles
       WHERE id = $1 AND password_hash IS NOT NULL`,
      [localPayload.userId]
    );

    if (result.rows.length === 0) {
      throw new Error('User not found or password authentication not enabled');
    }

    const user = result.rows[0];

    // Update auth_type to reflect current login method
    await query(
      `UPDATE user_profiles SET auth_type = 'local', updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
      [user.id]
    );

    return {
      id: user.id,
      email: user.email,
      fullName: user.full_name,
      role: user.role,
      authType: 'local',
    };
  } catch (localError) {
    // Not a local token, try Azure AD (only if configured)
    const clientId = process.env.AZURE_CLIENT_ID;
    const tenantId = process.env.AZURE_TENANT_ID;

    if (clientId && tenantId) {
      try {
        const azureToken = await verifyToken(token);
        return await getUserProfile(azureToken);
      } catch (azureError: any) {
        // Include the actual error message for debugging
        throw new Error(`Authentication failed: ${azureError.message || azureError}`);
      }
    } else {
      // Azure AD not configured, throw the local error
      throw new Error(`Local authentication failed: ${localError instanceof Error ? localError.message : localError}`);
    }
  }
}

/**
 * Get or create user profile from database
 * @param decodedToken Decoded Azure AD token
 * @returns User profile with role
 */
export async function getUserProfile(decodedToken: DecodedToken): Promise<UserProfile> {
  const azureAdObjectId = decodedToken.oid || decodedToken.sub;
  const email = decodedToken.email || decodedToken.emails?.[0] || '';
  const fullName = decodedToken.name || `${decodedToken.given_name || ''} ${decodedToken.family_name || ''}`.trim();

  // Try to get existing user profile by Azure AD Object ID
  const azureAdResult = await query(
    'SELECT id, azure_ad_object_id as "azureAdObjectId", email, full_name as "fullName", role, auth_type FROM user_profiles WHERE azure_ad_object_id = $1',
    [azureAdObjectId]
  );

  if (azureAdResult.rows.length > 0) {
    const user = azureAdResult.rows[0];

    // Update auth_type to reflect current login method
    await query(
      `UPDATE user_profiles SET auth_type = 'azure_sso', updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
      [user.id]
    );

    return {
      id: user.id,
      azureAdObjectId: user.azureAdObjectId,
      email: user.email,
      fullName: user.fullName,
      role: user.role,
      authType: 'azure_sso',
    };
  }

  // Check if a local user with this email already exists
  const emailResult = await query(
    'SELECT id, azure_ad_object_id as "azureAdObjectId", email, full_name as "fullName", role, auth_type, password_hash FROM user_profiles WHERE email = $1',
    [email]
  );

  if (emailResult.rows.length > 0) {
    const existingUser = emailResult.rows[0];

    // User exists with this email - link Azure AD to existing account
    console.log(`Linking Azure AD account to existing user: ${email} (was ${existingUser.auth_type}, has password: ${!!existingUser.password_hash})`);

    const updateResult = await query(
      `UPDATE user_profiles
       SET azure_ad_object_id = $1,
           full_name = COALESCE($2, full_name),
           auth_type = 'azure_sso',
           updated_at = CURRENT_TIMESTAMP
       WHERE email = $3
       RETURNING id, azure_ad_object_id as "azureAdObjectId", email, full_name as "fullName", role, auth_type`,
      [azureAdObjectId, fullName, email]
    );

    const user = updateResult.rows[0];

    console.log(`Successfully linked Azure AD to user ${user.id}. User can now authenticate with both Azure AD SSO and local password.`);

    return {
      id: user.id,
      azureAdObjectId: user.azureAdObjectId,
      email: user.email,
      fullName: user.fullName,
      role: user.role,
      authType: 'azure_sso',
    };
  }

  // No existing user found - create new user
  // Check if this is the first user in the system
  const userCountResult = await query('SELECT COUNT(*) as count FROM user_profiles');
  const userCount = parseInt(userCountResult.rows[0].count);

  // First user gets Promaster role, all others get 'user' role
  const role = userCount === 0 ? 'promaster' : 'user';

  // Create new user profile
  const insertResult = await query(
    `INSERT INTO user_profiles (azure_ad_object_id, email, full_name, role, auth_type)
     VALUES ($1, $2, $3, $4, 'azure_sso')
     RETURNING id, azure_ad_object_id as "azureAdObjectId", email, full_name as "fullName", role, auth_type`,
    [azureAdObjectId, email, fullName, role]
  );

  const user = insertResult.rows[0];

  console.log(`Created new Azure AD user: ${email} with role ${role}`);

  return {
    id: user.id,
    azureAdObjectId: user.azureAdObjectId,
    email: user.email,
    fullName: user.fullName,
    role: user.role,
    authType: 'azure_sso',
  };
}

/**
 * CORS headers configuration
 */
export function getCorsHeaders(origin?: string | null): Record<string, string> {
  const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(',') || [];
  const staticWebAppUrl = process.env.STATIC_WEB_APP_URL;

  if (staticWebAppUrl) {
    allowedOrigins.push(staticWebAppUrl);
  }

  // Add localhost for development
  if (process.env.NODE_ENV !== 'production') {
    allowedOrigins.push('http://localhost:5173', 'http://localhost:8080');
  }

  // SECURITY: Only allow known origins, never use wildcard
  // If origin is not in allowedOrigins, use first allowed origin as fallback (or reject)
  const allowedOrigin = origin && allowedOrigins.includes(origin)
    ? origin
    : (allowedOrigins[0] || null);

  // If no allowed origin is configured, reject CORS
  if (!allowedOrigin) {
    return {
      'Access-Control-Allow-Origin': 'null',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    };
  }

  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Credentials': 'true',
  };
}

/**
 * Check if user has required role
 * @param userRole User's current role
 * @param requiredRoles Array of roles that are allowed
 * @returns true if user has permission
 */
export function hasRole(
  userRole: string,
  requiredRoles: string[]
): boolean {
  return requiredRoles.includes(userRole);
}
