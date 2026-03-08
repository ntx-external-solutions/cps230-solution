# Azure AD User Management Setup Guide

## Overview

This guide explains how to set up dual authentication for your CPS230 application:
- **SSO Users**: Organizational users who sign in with their Microsoft account (existing functionality)
- **Local Users**: Users created by admins with username/password (new functionality)

Both types of users authenticate through the **same Azure AD tenant** and access the same application.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Azure AD Tenant                           │
│                                                              │
│  ┌────────────────┐         ┌─────────────────┐            │
│  │  SSO Users     │         │  Local Users    │            │
│  │  (Federated)   │         │  (Created via   │            │
│  │                │         │   Graph API)    │            │
│  └────────────────┘         └─────────────────┘            │
│           │                          │                       │
│           └──────────┬───────────────┘                       │
│                      │                                       │
└──────────────────────┼───────────────────────────────────────┘
                       │
                       ▼
              ┌────────────────┐
              │  CPS230 App    │
              │  (React SPA)   │
              └────────────────┘
```

## Prerequisites

1. Existing Azure AD app registration (you already have this: `3e1e105d-2adb-4107-904a-4c2b58a3aeb9`)
2. Azure Function App deployed and running
3. Promaster role access in the application

## Step 1: Configure App Registration Permissions

### 1.1 Navigate to App Registration

1. Go to [Azure Portal](https://portal.azure.com)
2. Navigate to **Azure Active Directory** > **App registrations**
3. Find your app: **CPS230 Web Application** (Client ID: `3e1e105d-2adb-4107-904a-4c2b58a3aeb9`)

### 1.2 Add Microsoft Graph API Permissions

1. Click on **API permissions** in the left menu
2. Click **+ Add a permission**
3. Select **Microsoft Graph**
4. Select **Application permissions** (not Delegated)
5. Search for and select the following permissions:
   - `User.ReadWrite.All` - Create, read, update, and delete users
   - `Directory.ReadWrite.All` - Read and write directory data (optional, for advanced scenarios)
6. Click **Add permissions**

### 1.3 Grant Admin Consent

**CRITICAL:** Application permissions require admin consent.

1. After adding permissions, click **Grant admin consent for [Your Tenant]**
2. Click **Yes** to confirm
3. Verify that all permissions show a green checkmark under "Status"

## Step 2: Create Service Principal (App Registration Credentials)

Your Azure Function needs credentials to call Microsoft Graph API on behalf of the application.

### 2.1 Create Client Secret

1. In your app registration, go to **Certificates & secrets**
2. Click **+ New client secret**
3. Add a description: `CPS230 Graph API Access`
4. Select expiration: **730 days (24 months)** or **Custom** for longer
5. Click **Add**
6. **IMMEDIATELY copy the secret value** - it won't be shown again!

### 2.2 Note Required Values

You'll need these three values for configuration:
- **Tenant ID**: `b457875d-e043-4358-82d1-efe29223e6f8`
- **Client ID**: `3e1e105d-2adb-4107-904a-4c2b58a3aeb9`
- **Client Secret**: [The value you just copied]

## Step 3: Configure Azure Function App

### 3.1 Add Environment Variables to Function App

Using Azure Portal:

1. Navigate to your Function App: `func-cps230-dev-w4n7p6pwjelzi`
2. Go to **Configuration** > **Application settings**
3. Add the following settings:

```
AZURE_TENANT_ID = b457875d-e043-4358-82d1-efe29223e6f8
AZURE_CLIENT_ID = 3e1e105d-2adb-4107-904a-4c2b58a3aeb9
AZURE_CLIENT_SECRET = [paste the secret you copied]
```

4. Click **Save**
5. Click **Continue** to restart the Function App

### 3.2 Using Azure CLI (Alternative)

```bash
az functionapp config appsettings set \
  --name func-cps230-dev-w4n7p6pwjelzi \
  --resource-group [your-resource-group] \
  --settings \
    AZURE_TENANT_ID="b457875d-e043-4358-82d1-efe29223e6f8" \
    AZURE_CLIENT_ID="3e1e105d-2adb-4107-904a-4c2b58a3aeb9" \
    AZURE_CLIENT_SECRET="[your-secret-value]"
```

## Step 4: Deploy Backend Changes

### 4.1 Build and Deploy

```bash
cd backend
npm install
npm run build
```

### 4.2 Deploy to Azure Functions

```bash
func azure functionapp publish func-cps230-dev-w4n7p6pwjelzi
```

## Step 5: Test the Integration

### 5.1 Access User Management

1. Sign in to your CPS230 application as a Promaster user
2. Navigate to **Users** in the sidebar
3. You should see the User Management page

### 5.2 Create a Test User

1. Click **Create User**
2. Fill in the form:
   - **Email**: `testuser@yourdomain.com`
   - **Display Name**: `Test User`
   - **Password**: Create a strong password (min 8 chars)
   - **Role**: Select `User (View Only)`
3. Click **Create User**

### 5.3 Verify User Creation

1. Check that the user appears in the users list
2. Go to [Azure Portal](https://portal.azure.com) > **Azure Active Directory** > **Users**
3. Confirm the user exists in Azure AD

### 5.4 Test Authentication

1. Open an incognito/private browser window
2. Navigate to your CPS230 app
3. Sign in with the credentials you just created
4. Verify you can access the application

## How It Works

### Authentication Flow for Local Users

1. Admin creates user via User Management page
2. Backend calls Microsoft Graph API to create user in Azure AD
3. User record is also created in PostgreSQL database
4. User signs in with email/password
5. MSAL authenticates against Azure AD (same as SSO users)
6. User receives Azure AD token and accesses the app

### Authentication Flow for SSO Users

1. User clicks "Sign in"
2. MSAL redirects to Azure AD login
3. User authenticates with organizational credentials
4. Azure AD issues token
5. User profile created/updated in PostgreSQL on first login
6. User accesses the app

**Key Point**: Both flows use the same Azure AD tenant and MSAL authentication - the only difference is how the user account was created!

## User Management Features

### Create Users

Promaster users can create new Azure AD users with:
- Email address (username)
- Display name
- Password
- Application role (User, Business Analyst, Promaster)
- Optional: Job title, Department
- Option to force password change on first sign-in

### Reset Passwords

Promasters can reset passwords for any user and optionally require password change on next sign-in.

### Delete Users

Promasters can delete users from both Azure AD and the application database.

## Security Considerations

### Password Requirements

Azure AD enforces password policies:
- Minimum 8 characters
- Complexity requirements (uppercase, lowercase, numbers, symbols)
- Cannot contain common patterns

### Best Practices

1. **Client Secret Management**:
   - Store client secret in Azure Key Vault (production)
   - Rotate secrets before expiration
   - Never commit secrets to source control

2. **Least Privilege**:
   - Only grant `User.ReadWrite.All` permission (don't over-permission)
   - Limit Promaster role to trusted administrators

3. **Monitoring**:
   - Enable Azure AD audit logs
   - Monitor user creation/deletion events
   - Set up alerts for suspicious activity

4. **Password Policies**:
   - Always enable "Force password change on first sign-in" for new users
   - Encourage strong passwords
   - Consider enabling MFA for sensitive roles

## Troubleshooting

### Error: "Insufficient privileges to complete the operation"

**Cause**: Application doesn't have necessary Microsoft Graph permissions.

**Solution**:
1. Verify `User.ReadWrite.All` permission is added
2. Ensure admin consent was granted
3. Wait 5-10 minutes for permissions to propagate

### Error: "The specified client secret is invalid"

**Cause**: Client secret is incorrect or expired.

**Solution**:
1. Generate new client secret in Azure Portal
2. Update `AZURE_CLIENT_SECRET` in Function App settings
3. Restart Function App

### Error: "User already exists"

**Cause**: A user with that email already exists in Azure AD.

**Solution**:
1. Try a different email address, or
2. Delete the existing user first (if appropriate)

### Users can't sign in after creation

**Possible causes**:
1. Password doesn't meet Azure AD complexity requirements
2. User account not fully provisioned (wait 1-2 minutes)
3. Browser cache issues (try incognito mode)

### "Failed to fetch users" error

**Cause**: Function App can't authenticate to Microsoft Graph.

**Solution**:
1. Verify all three environment variables are set correctly
2. Check Function App logs for detailed error messages
3. Ensure Function App has outbound internet access

## API Reference

### Create User

```http
POST /api/azure-users
Content-Type: application/json
Authorization: Bearer {user-token}

{
  "email": "user@example.com",
  "displayName": "John Doe",
  "password": "SecurePass123!",
  "role": "user",
  "forceChangePassword": true,
  "jobTitle": "Analyst",
  "department": "Finance"
}
```

### List Users

```http
GET /api/azure-users
Authorization: Bearer {user-token}
```

### Reset Password

```http
PATCH /api/azure-users/{userId}/reset-password
Content-Type: application/json
Authorization: Bearer {user-token}

{
  "newPassword": "NewSecurePass123!",
  "forceChangePassword": true
}
```

### Delete User

```http
DELETE /api/azure-users/{userId}
Authorization: Bearer {user-token}
```

## Migration from Old System

If you have existing users in the old Users page with placeholder Azure AD IDs:

1. Export existing user data (email, role)
2. Create proper Azure AD users using the new User Management page
3. Users will need to sign in with their new credentials
4. Old placeholder records will be replaced automatically on first sign-in

## Future Enhancements

Potential improvements to consider:

1. **Bulk User Import**: Upload CSV of users to create multiple accounts
2. **Password Policy Configuration**: Custom password complexity rules
3. **Self-Service Password Reset**: Allow users to reset their own passwords
4. **User Groups**: Organize users into groups for easier management
5. **Audit Log**: Track all user management actions

## Support

For issues or questions:
1. Check Function App logs in Azure Portal
2. Review Azure AD audit logs
3. Consult Microsoft Graph API documentation
4. Contact your Azure administrator

## References

- [Microsoft Graph API - Users](https://learn.microsoft.com/en-us/graph/api/resources/user)
- [Azure AD App Registration](https://learn.microsoft.com/en-us/azure/active-directory/develop/quickstart-register-app)
- [MSAL.js Documentation](https://github.com/AzureAD/microsoft-authentication-library-for-js)
- [Azure AD Password Policies](https://learn.microsoft.com/en-us/azure/active-directory/authentication/concept-password-ban-bad)
