import jwt from 'jsonwebtoken';

// JWT secret from environment variable (generate a secure random string for production)
const JWT_SECRET = process.env.JWT_SECRET;

// Validate JWT_SECRET is set and meets minimum security requirements
if (!JWT_SECRET) {
  throw new Error('CRITICAL: JWT_SECRET environment variable must be set');
}

if (JWT_SECRET.length < 32) {
  throw new Error('CRITICAL: JWT_SECRET must be at least 32 characters long for security');
}

const JWT_EXPIRATION = '24h'; // Token expires in 24 hours

export interface LocalUserTokenPayload {
  userId: string;
  email: string;
  role: string;
  authType: 'local';
}

/**
 * Generate a JWT token for a local user
 */
export function generateLocalUserToken(payload: LocalUserTokenPayload): string {
  return jwt.sign(payload, JWT_SECRET, {
    expiresIn: JWT_EXPIRATION,
    issuer: 'cps230-app',
    audience: 'cps230-users',
  });
}

/**
 * Verify and decode a local user JWT token
 */
export function verifyLocalUserToken(token: string): LocalUserTokenPayload {
  try {
    const decoded = jwt.verify(token, JWT_SECRET, {
      issuer: 'cps230-app',
      audience: 'cps230-users',
    }) as LocalUserTokenPayload;

    return decoded;
  } catch (error) {
    throw new Error('Invalid or expired token');
  }
}

/**
 * Extract token from Authorization header
 */
export function extractTokenFromHeader(authHeader: string | null): string | null {
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }

  return authHeader.substring(7); // Remove 'Bearer ' prefix
}
