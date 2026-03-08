# Dual Authentication Setup Guide - LOCAL DATABASE VERSION

## Overview

Your CPS230 application now supports **two separate authentication systems**:

1. **Azure AD SSO** - For organizational users (existing functionality via MSAL)
2. **Local Database Auth** - For users created by admins with email/password (NEW!)

**KEY POINT:** Local users are stored ONLY in PostgreSQL (not Azure AD), saving on Azure AD licensing costs.

## What Was Built

### Backend Changes

**New Files:**
- `backend/shared/password.ts` - Password hashing utilities (bcrypt)
- `backend/shared/jwt.ts` - JWT token generation/verification for local users
- `backend/functions/auth-local.ts` - Authentication endpoints for local users
  - `POST /api/auth/local/login` - Local user login
  - `POST /api/auth/local/users` - Create local user (admin only)
  - `PATCH /api/auth/local/users/{id}/reset-password` - Reset password (admin only)

**Modified Files:**
- `backend/shared/auth.ts` - Added `authenticateRequestUnified()` to support both token types
- `backend/package.json` - Added `bcryptjs` dependency

**Database Migration:**
- `database/migrations/004_add_local_user_auth.sql` - Adds password support to user_profiles table

### Frontend Changes (Partial - More Work Needed)

**Modified Files:**
- `src/pages/Users.tsx` - Updated to create local database users instead of Azure AD users

**Still TODO:**
- Update `src/contexts/AuthContext.tsx` to support dual authentication
- Update `src/pages/Login.tsx` to show two sign-in options
- Remove all B2C references

## How It Works

### Local User Flow

```
1. Admin creates user via Users page
   ↓
2. Backend creates record in PostgreSQL with hashed password
   ↓
3. User signs in with email/password
   ↓
4. Backend verifies password, generates JWT token
   ↓
5. Frontend stores JWT token, user accesses app
```

### SSO User Flow (Unchanged)

```
1. User clicks "Sign in with Microsoft"
   ↓
2. MSAL redirects to Azure AD
   ↓
3. User authenticates via Azure AD
   ↓
4. Azure AD returns token
   ↓
5. Backend verifies Azure AD token
   ↓
6. User profile created/updated in PostgreSQL
   ↓
7. User accesses app
```

## Database Schema

The `user_profiles` table now supports both auth types:

```sql
CREATE TABLE user_profiles (
  id UUID PRIMARY KEY,
  azure_ad_object_id TEXT,        -- NULL for local users
  email TEXT NOT NULL UNIQUE,
  full_name TEXT,
  role user_role,
  password_hash TEXT,              -- NULL for Azure AD users
  auth_type TEXT,                  -- 'azure_sso' or 'local'
  created_at TIMESTAMP,
  updated_at TIMESTAMP,
  CONSTRAINT check_auth_method CHECK (
    (azure_ad_object_id IS NOT NULL AND password_hash IS NULL) OR
    (azure_ad_object_id IS NULL AND password_hash IS NOT NULL)
  )
);
```

## Setup Steps

### 1. Run Database Migration

```bash
# Connect to your Azure PostgreSQL database
psql "host=psql-cps230-dev-w4n7p6pwjelzi.postgres.database.azure.com dbname=cps230 user=cps230admin sslmode=require"

# Run the migration
\i database/migrations/004_add_local_user_auth.sql
```

### 2. Add Environment Variable (Backend)

Add to your Function App settings:

```bash
JWT_SECRET=[generate a secure random string - at least 32 characters]
```

Generate a secure secret:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### 3. Install Backend Dependencies

```bash
cd backend
npm install
```

### 4. Build and Deploy Backend

```bash
cd backend
npm run build
func azure functionapp publish func-cps230-dev-w4n7p6pwjelzi
```

### 5. Update Frontend (TODO - Next Steps)

The frontend still needs updates to:
1. Support local login on the login page
2. Update AuthContext to handle both auth types
3. Store/retrieve JWT tokens for local users

## Password Requirements

Local user passwords must meet these requirements:
- Minimum 8 characters
- At least one lowercase letter
- At least one uppercase letter
- At least one number
- At least one special character

## Security Features

✅ **Bcrypt password hashing** (12 salt rounds)
✅ **JWT tokens** with 24-hour expiration
✅ **Separate authentication paths** for SSO vs local
✅ **Password complexity validation**
✅ **Database constraint** ensures users have either Azure ID OR password (not both)

## API Endpoints

### Local User Login
```http
POST /api/auth/local/login
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "SecurePassword123!"
}

Response:
{
  "token": "eyJhbGc...",
  "user": {
    "id": "uuid",
    "email": "user@example.com",
    "full_name": "John Doe",
    "role": "user",
    "auth_type": "local"
  }
}
```

### Create Local User (Admin Only)
```http
POST /api/auth/local/users
Content-Type: application/json
Authorization: Bearer {admin-token}

{
  "email": "newuser@example.com",
  "password": "SecurePassword123!",
  "full_name": "Jane Doe",
  "role": "user"
}
```

### Reset Password (Admin Only)
```http
PATCH /api/auth/local/users/{userId}/reset-password
Content-Type: application/json
Authorization: Bearer {admin-token}

{
  "newPassword": "NewSecurePassword123!"
}
```

## Testing

### Create First Local User

```bash
curl -X POST https://func-cps230-dev-w4n7p6pwjelzi.azurewebsites.net/api/auth/local/users \
  -H "Content-Type: application/json" \
  -d '{
    "email": "admin@example.com",
    "password": "AdminPass123!",
    "full_name": "Admin User",
    "role": "promaster"
  }'
```

### Test Login

```bash
curl -X POST https://func-cps230-dev-w4n7p6pwjelzi.azurewebsites.net/api/auth/local/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "admin@example.com",
    "password": "AdminPass123!"
  }'
```

## Next Steps (Frontend TODO)

### 1. Update Login Page

Add two sign-in options:
- "Sign in with Microsoft" (existing MSAL flow)
- "Sign in with Email" (new local auth flow)

### 2. Update AuthContext

Modify `src/contexts/AuthContext.tsx` to:
- Support both MSAL and local authentication
- Store JWT tokens in localStorage for local users
- Check token validity on mount
- Provide both `signInWithMicrosoft()` and `signInWithEmail()` methods

### 3. Update API Client

Modify `src/lib/azureApi.ts` to:
- Include JWT token in Authorization header for local users
- Handle token refresh/expiration

### 4. Clean Up B2C References

Remove all B2C-related code and environment variables:
- Remove `VITE_B2C_*` variables
- Delete `setup-b2c.sh`
- Delete `B2C_SETUP_GUIDE.md`
- Update README to reflect new auth approach

## Cost Savings

**Before:** All users required Azure AD licenses

**After:**
- SSO users: Use existing organizational Azure AD (no extra cost)
- Local users: PostgreSQL only (no Azure AD cost)

This approach **eliminates Azure AD licensing costs for local users** while maintaining enterprise SSO for organizational users.

## Support & Troubleshooting

### User Can't Sign In

**Local User:**
1. Check password meets requirements
2. Verify user exists in database: `SELECT * FROM user_profiles WHERE email = 'user@example.com'`
3. Check JWT_SECRET is set in Function App
4. Check Function App logs for errors

**SSO User:**
1. Verify Azure AD credentials are correct in `.env`
2. Check MSAL configuration in `AuthContext.tsx`
3. Ensure user has access to Azure AD tenant

### Password Reset Not Working

1. Verify admin has Promaster role
2. Check user `auth_type` is 'local'
3. Verify new password meets complexity requirements

## Files Reference

**Backend:**
- `backend/shared/password.ts` - Password utilities
- `backend/shared/jwt.ts` - JWT utilities
- `backend/shared/auth.ts` - Authentication middleware
- `backend/functions/auth-local.ts` - Local auth endpoints

**Database:**
- `database/migrations/004_add_local_user_auth.sql` - Schema migration

**Frontend:**
- `src/pages/Users.tsx` - User management UI
- `src/contexts/AuthContext.tsx` - (TODO: Update for dual auth)
- `src/pages/Login.tsx` - (TODO: Add local login option)

## Architecture Benefits

✅ **Cost-effective:** No Azure AD costs for local users
✅ **Flexible:** Supports both SSO and local auth
✅ **Secure:** Industry-standard bcrypt + JWT
✅ **Scalable:** Separate auth paths for different user types
✅ **Maintainable:** Clear separation of concerns

## Questions?

- Check Function App logs for backend errors
- Review database migrations for schema issues
- Consult code comments in auth files for implementation details
