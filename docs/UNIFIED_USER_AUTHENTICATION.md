# Unified User Authentication

## Overview

The CPS230 solution supports unified user accounts where a single user can authenticate using **both** local username/password **and** Azure AD SSO. Users are merged based on email address, ensuring one user = one account, regardless of authentication method.

---

## How It Works

### Scenario 1: Local User Logs In via SSO (Most Common)

**Initial State:**
- User created by admin with email `user@example.com` and password
- User record has `auth_type = 'local'` and `password_hash`

**User Logs In via Azure AD SSO:**
1. User clicks "Sign In with Microsoft"
2. Azure AD authenticates user and returns email `user@example.com`
3. Backend detects existing local user with same email
4. Backend **links** Azure AD to existing account by:
   - Adding `azure_ad_object_id` to user record
   - Updating `auth_type` to `'azure_sso'`
   - **Keeping** `password_hash` intact
5. User is logged in successfully

**Result:**
- Single user account with both authentication methods available
- User can login with either:
  - Azure AD SSO (Microsoft button)
  - Local password (Email/Password tab)

**Database State After Linking:**
```sql
SELECT id, email, auth_type,
       azure_ad_object_id IS NOT NULL as has_sso,
       password_hash IS NOT NULL as has_password
FROM user_profiles
WHERE email = 'user@example.com';

-- Result:
-- id  | email              | auth_type  | has_sso | has_password
-- 123 | user@example.com   | azure_sso  | true    | true
```

---

### Scenario 2: SSO User Gets Password Added

**Initial State:**
- User first logged in via Azure AD SSO
- User record has `auth_type = 'azure_sso'` and `azure_ad_object_id`
- No `password_hash` yet

**Admin Tries to Create Local User:**
1. Admin goes to Users page → Create User
2. Admin enters email `user@example.com` and password
3. Backend detects existing Azure AD user with same email
4. Backend returns error:
   ```json
   {
     "error": "User with this email already exists and is linked to Azure AD SSO",
     "message": "This email address is already registered. Please use the 'Sign In with Microsoft' option to login.",
     "authType": "azure_sso"
   }
   ```

**Result:**
- User creation is prevented (no duplicate account)
- User must use SSO to login
- Admin sees clear message explaining why

**Future Enhancement (Optional):**
- Could allow admin to add password to existing SSO user
- Would update the user record to add `password_hash`
- User could then use both auth methods

---

## User Authentication Flow

### When User Logs In

The `authenticateRequestUnified()` function tries authentication in this order:

1. **Try Local JWT Token First** (faster)
   - Decode token
   - Verify signature with JWT_SECRET
   - Query database for user by ID
   - Return user profile if valid

2. **Try Azure AD Token** (if local fails and Azure AD configured)
   - Verify token with Azure AD JWKS
   - Query database for user by `azure_ad_object_id`
   - If user found, return profile
   - If user not found, check by email and link/create account

### Benefits of This Approach

✅ **User Convenience**: Users can authenticate however they prefer
✅ **No Duplicate Accounts**: Email-based matching prevents duplicates
✅ **Graceful Migration**: Local users can start using SSO without losing access
✅ **Fallback**: If SSO is down, local password still works
✅ **Admin Flexibility**: Can provision users before SSO is configured

---

## Database Schema

### User Profile Fields

```sql
CREATE TABLE user_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  azure_ad_object_id TEXT UNIQUE,        -- NULL for local-only users
  password_hash TEXT,                     -- NULL for SSO-only users
  full_name TEXT,
  role TEXT NOT NULL DEFAULT 'user',
  auth_type TEXT NOT NULL DEFAULT 'local', -- 'local', 'azure_sso'
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);
```

### Authentication States

| State | azure_ad_object_id | password_hash | auth_type | Can Use SSO? | Can Use Password? |
|-------|-------------------|---------------|-----------|--------------|-------------------|
| **Local Only** | NULL | Present | local | ❌ No | ✅ Yes |
| **SSO Only** | Present | NULL | azure_sso | ✅ Yes | ❌ No |
| **Dual Auth** | Present | Present | azure_sso | ✅ Yes | ✅ Yes |

---

## Code Implementation

### Backend: `getUserProfile()` in `backend/shared/auth.ts`

**Logic:**
1. Check for existing user by `azure_ad_object_id` → Return if found
2. Check for existing user by `email` → Link Azure AD and return if found
3. No existing user → Create new Azure AD user

**Key Code:**
```typescript
// Check if local user exists with same email
const emailResult = await query(
  'SELECT id, azure_ad_object_id, email, role, auth_type, password_hash FROM user_profiles WHERE email = $1',
  [email]
);

if (emailResult.rows.length > 0) {
  // Link Azure AD to existing local user
  await query(
    `UPDATE user_profiles
     SET azure_ad_object_id = $1,
         full_name = COALESCE($2, full_name),
         auth_type = 'azure_sso'
     WHERE email = $3`,
    [azureAdObjectId, fullName, email]
  );

  // User can now use both SSO and password!
}
```

### Backend: User Creation in `backend/functions/auth-local.ts`

**Logic:**
1. Check if user exists by email
2. If exists and has `azure_ad_object_id` → Return error suggesting SSO
3. If exists without `azure_ad_object_id` → Return error (duplicate)
4. If doesn't exist → Create new local user

**Key Code:**
```typescript
const existingUser = await query(
  'SELECT id, email, auth_type, azure_ad_object_id FROM user_profiles WHERE email = $1',
  [email]
);

if (existingUser.rows.length > 0 && existingUser.rows[0].azure_ad_object_id) {
  return {
    status: 409,
    jsonBody: {
      error: 'User with this email already exists and is linked to Azure AD SSO',
      message: 'Please use the "Sign In with Microsoft" option to login.',
      authType: 'azure_sso'
    }
  };
}
```

---

## Frontend Considerations

### Login Page

The login page offers both authentication methods:

```tsx
<Tabs defaultValue="email">
  <TabsList>
    <TabsTrigger value="email">Email</TabsTrigger>
    <TabsTrigger value="microsoft">Microsoft SSO</TabsTrigger>
  </TabsList>

  <TabsContent value="email">
    {/* Local username/password login */}
  </TabsContent>

  <TabsContent value="microsoft">
    {/* Azure AD SSO login */}
  </TabsContent>
</Tabs>
```

**For Dual Auth Users:**
- Can switch between tabs and use either method
- Both methods authenticate to the same user account
- Role, permissions, and data are identical regardless of auth method

### User Management Page (Admin)

When creating users, admins should see:
- **Success**: User created with local password
- **Error**: "User already exists with SSO - tell them to use Microsoft login"

**Future Enhancement:**
Could show which auth methods each user has available:
```tsx
<UserTable>
  <UserRow>
    <td>user@example.com</td>
    <td>Business Analyst</td>
    <td>
      <Badge>SSO</Badge>
      <Badge>Password</Badge>
    </td>
  </UserRow>
</UserTable>
```

---

## Migration Scenarios

### Migrating from Local to SSO

**Before Azure AD Configuration:**
- All users created with local passwords
- `auth_type = 'local'`, no `azure_ad_object_id`

**After Azure AD Configuration:**
- Existing local users still login with password
- When they login via SSO for first time:
  - Account automatically linked
  - Can now use either auth method

**No User Action Required!**

### Migrating from SSO to Include Local

**Before:**
- Users only have SSO
- `auth_type = 'azure_sso'`, has `azure_ad_object_id`, no `password_hash`

**To Add Password:**
1. Admin creates "new user" with same email (currently blocked)
2. OR (future feature): Admin can "Add Password" to existing SSO user

**Currently:**
- Cannot add password to existing SSO user
- User must use SSO only

---

## Security Considerations

### Password Security
- When linking Azure AD to local user, `password_hash` is **retained**
- User can still use password even after SSO is linked
- Passwords are hashed with bcrypt (12 rounds)

### Why Keep Password After SSO Linking?

✅ **Fallback Access**: If Azure AD is unavailable, user can still login
✅ **User Choice**: User decides which method is more convenient
✅ **No Forced Migration**: Users aren't locked out of password auth

### Preventing Duplicate Accounts

✅ **Email Uniqueness**: Database constraint ensures one account per email
✅ **Pre-Creation Check**: Local user creation checks for existing Azure AD users
✅ **Auto-Linking**: SSO login automatically links to existing local users
✅ **Clear Error Messages**: Users told to use SSO if account already exists with SSO

### Authentication Token Security

- **Local Tokens**: JWT signed with `JWT_SECRET` (min 32 chars), 24-hour expiration
- **Azure AD Tokens**: Verified against Microsoft's JWKS endpoint, RS256 algorithm
- **Token Storage**: Frontend stores tokens in localStorage (separate keys for each type)

---

## Logging and Auditing

The system logs account linking events:

```
Linking Azure AD account to existing user: user@example.com (was local, has password: true)
Successfully linked Azure AD to user abc-123-def. User can now authenticate with both Azure AD SSO and local password.
```

**Recommended Enhancements:**
- Add linking events to audit log table
- Track when users switch between auth methods
- Alert admins when mass linking occurs (potential issues)

---

## FAQ

### Q: What happens if a local user and SSO user have the same email?
**A:** They become one unified account. When the user logs in via SSO for the first time, the backend automatically links their Azure AD identity to their existing local account.

### Q: Can a user change their preferred authentication method?
**A:** Yes, users with dual auth can use whichever method they prefer. There's no "default" - both are equally valid.

### Q: What if Azure AD is removed/disabled later?
**A:** Users who have passwords can continue using local authentication. Users without passwords would lose access (unless admin adds passwords to their accounts).

### Q: Can I force all users to use SSO only?
**A:** Not currently, but you could:
1. Don't create local users (only allow SSO)
2. Remove password hashes from existing users
3. Disable local auth endpoints

### Q: What if the email address changes in Azure AD?
**A:** The link is based on `azure_ad_object_id`, not email. If email changes in Azure AD, the next SSO login will update the email in the database. However, if email changes and a NEW user in Azure AD has the OLD email, they could get linked incorrectly. This is a known limitation of email-based matching.

**Mitigation:**
- Primary matching is by `azure_ad_object_id` (doesn't change)
- Email linking only happens on first SSO login
- After first link, `azure_ad_object_id` is the source of truth

### Q: Can an admin manually unlink SSO from a user?
**A:** Not currently in the UI, but you could run SQL:
```sql
UPDATE user_profiles
SET azure_ad_object_id = NULL,
    auth_type = 'local'
WHERE email = 'user@example.com';
```
This would remove SSO but keep the password.

---

## Future Enhancements

### 1. Admin UI for Managing Auth Methods
- Show which auth methods each user has
- Allow admin to:
  - Add password to SSO-only users
  - Remove password from dual-auth users (force SSO only)
  - Unlink Azure AD (revert to local only)

### 2. User Self-Service
- Allow users to add/change their password (if they have SSO)
- Allow users to link their own Azure AD account (by logging in)

### 3. Multi-Factor Authentication (MFA)
- Azure AD handles MFA for SSO users
- For local users, could add TOTP-based MFA

### 4. Auth Method Analytics
- Track which auth method each user uses most
- Help admins understand if SSO migration is complete
- Identify users who could have passwords removed

---

## Summary

The unified authentication system provides:

✅ **Single Account Per User**: Email-based matching prevents duplicates
✅ **Dual Authentication**: Users can authenticate with SSO, password, or both
✅ **Automatic Linking**: SSO login automatically links to existing local accounts
✅ **Clear Error Messages**: Prevents duplicate account creation with helpful guidance
✅ **Backward Compatible**: Existing local users seamlessly gain SSO access
✅ **Flexible**: Supports local-only, SSO-only, or dual authentication per user

This design prioritizes user convenience and admin flexibility while maintaining security and preventing account duplication.

---

**Last Updated:** 2026-03-14
**Version:** 1.0.0
