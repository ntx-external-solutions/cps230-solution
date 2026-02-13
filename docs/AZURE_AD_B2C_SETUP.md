# Azure AD B2C Setup Guide

This guide walks through setting up Azure AD B2C authentication for the CPS230 Solution.

## Overview

Azure AD B2C provides enterprise-grade authentication with support for:
- Sign-up and sign-in flows
- Password reset
- Multi-factor authentication
- Social identity providers (optional)
- Custom branding

## Step 1: Create Azure AD B2C Tenant

1. Navigate to [Azure Portal](https://portal.azure.com)
2. Click **Create a resource**
3. Search for **Azure Active Directory B2C**
4. Click **Create**
5. Select **Create a new Azure AD B2C Tenant**
6. Fill in the details:
   - Organization name: `CPS230 Solution`
   - Initial domain name: `cps230solution` (or your preferred name)
   - Country/Region: Select your primary region
7. Click **Review + create** and then **Create**
8. Wait for tenant creation (2-3 minutes)
9. Click **Switch to new tenant** when prompted

## Step 2: Register Application

1. In your Azure AD B2C tenant, navigate to **Azure AD B2C** service
2. Go to **App registrations** under **Manage**
3. Click **New registration**
4. Configure the application:
   - Name: `CPS230 Web Application`
   - Supported account types: **Accounts in any identity provider or organizational directory**
   - Redirect URI:
     - Platform: **Single-page application (SPA)**
     - URI: `https://your-static-web-app.azurestaticapps.net/auth/callback`
5. Click **Register**
6. **Save the Application (client) ID** - you'll need this later

## Step 3: Configure Authentication

1. In your app registration, go to **Authentication**
2. Under **Implicit grant and hybrid flows**, enable:
   - [x] Access tokens
   - [x] ID tokens
3. Under **Allow public client flows**: **No**
4. Click **Save**

## Step 4: Add API Permissions

1. Go to **API permissions**
2. Click **Add a permission**
3. Select **Microsoft Graph**
4. Choose **Delegated permissions**
5. Add these permissions:
   - `openid`
   - `profile`
   - `email`
   - `offline_access`
6. Click **Add permissions**
7. Click **Grant admin consent** for your tenant

## Step 5: Create User Flows

### Sign-up and Sign-in Flow

1. Go to **User flows** under **Policies**
2. Click **New user flow**
3. Select **Sign up and sign in** (Recommended)
4. Choose version: **Recommended**
5. Configure the flow:
   - Name: `signupsignin` (will become `B2C_1_signupsignin`)
   - Identity providers: **Email signup**
   - User attributes and token claims:
     - Collect:
       - [x] Display Name
       - [x] Email Address
       - [x] Given Name
       - [x] Surname
     - Return:
       - [x] Display Name
       - [x] Email Addresses
       - [x] Given Name
       - [x] Surname
       - [x] User's Object ID
6. Click **Create**

### Password Reset Flow

1. Click **New user flow**
2. Select **Password reset**
3. Choose version: **Recommended**
4. Configure:
   - Name: `passwordreset`
   - Identity providers: **Reset password using email address**
   - Application claims: Select same as sign-up flow
5. Click **Create**

## Step 6: Configure Token Lifetime (Optional)

1. Select your `B2C_1_signupsignin` user flow
2. Go to **Properties**
3. Configure token lifetime:
   - Access token lifetime: `60` minutes
   - Refresh token lifetime: `1440` minutes (1 day)
   - Refresh token sliding window: `90` days
4. Click **Save**

## Step 7: Add Redirect URIs

Add redirect URIs for all environments:

1. Go to **App registrations** > Your app > **Authentication**
2. Under **Single-page application**, add these URIs:
   - Production: `https://your-static-web-app.azurestaticapps.net/auth/callback`
   - Staging: `https://your-staging-app.azurestaticapps.net/auth/callback`
   - Development: `http://localhost:5173/auth/callback`
3. Add logout redirect URIs:
   - Production: `https://your-static-web-app.azurestaticapps.net`
   - Staging: `https://your-staging-app.azurestaticapps.net`
   - Development: `http://localhost:5173`
4. Click **Save**

## Step 8: Update Application Configuration

### Backend (Function App)

Update Function App environment variables:

```bash
az functionapp config appsettings set \
  --name <your-function-app-name> \
  --resource-group <your-resource-group> \
  --settings \
    AZURE_AD_B2C_TENANT_NAME="<your-tenant-name>" \
    AZURE_AD_B2C_CLIENT_ID="<your-client-id>" \
    AZURE_AD_B2C_POLICY_NAME="B2C_1_signupsignin" \
    ALLOWED_ORIGINS="https://your-static-web-app.azurestaticapps.net"
```

Or via Azure Portal:
1. Navigate to your Function App
2. Go to **Configuration** > **Application settings**
3. Add/update the settings above
4. Click **Save**

### Frontend (Static Web App)

Update Static Web App configuration:

```bash
az staticwebapp appsettings set \
  --name <your-static-web-app-name> \
  --resource-group <your-resource-group> \
  --setting-names \
    VITE_B2C_TENANT_NAME="<your-tenant-name>" \
    VITE_B2C_CLIENT_ID="<your-client-id>" \
    VITE_B2C_POLICY_NAME="B2C_1_signupsignin" \
    VITE_API_URL="https://<your-function-app>.azurewebsites.net/api"
```

Or create `.env.production`:

```env
VITE_B2C_TENANT_NAME=your-tenant-name
VITE_B2C_CLIENT_ID=your-client-id
VITE_B2C_POLICY_NAME=B2C_1_signupsignin
VITE_API_URL=https://your-function-app.azurewebsites.net/api
```

## Step 9: Test Authentication

1. Navigate to your application URL
2. Click **Sign In**
3. You should be redirected to Azure AD B2C sign-in page
4. Click **Sign up now** to create a test account
5. Fill in the required information
6. Complete email verification
7. You should be redirected back to the application

## Step 10: Verify User in Database

After signing up, verify the user was created in the database:

```sql
-- Connect to PostgreSQL
psql "host=<postgres-server> dbname=cps230 user=cps230admin sslmode=require"

-- Check user profile was created
SELECT * FROM user_profiles WHERE email = 'test@example.com';
```

## Customization (Optional)

### Custom Branding

1. In Azure AD B2C, go to **Company branding**
2. Upload your logo and customize colors
3. The branding will appear on sign-in pages

### Custom Domains

1. Go to **Custom domains** in Azure AD B2C
2. Add your custom domain (e.g., `login.yourcompany.com`)
3. Verify domain ownership
4. Update DNS records
5. Update redirect URIs to use custom domain

### Multi-Factor Authentication

1. Go to your user flow
2. Under **Multifactor authentication**, select:
   - [ ] Off
   - [x] Always on
   - [ ] Conditional
3. Choose method: **Email** or **SMS**
4. Click **Save**

## Troubleshooting

### Issue: "AADB2C90118" Error (Password Reset)

This error occurs when user clicks "Forgot password?" but the password reset flow is not configured.

**Solution:**
1. Ensure password reset user flow is created
2. Update frontend code to handle password reset flow
3. Or configure combined sign-up/sign-in with password reset

### Issue: "Redirect URI mismatch"

**Solution:**
1. Verify redirect URI in app registration matches exactly
2. Check for trailing slashes
3. Ensure URI uses HTTPS (not HTTP) in production

### Issue: Token validation fails

**Solution:**
1. Verify tenant name is correct in backend configuration
2. Check client ID matches app registration
3. Ensure policy name includes `B2C_1_` prefix
4. Verify backend can reach `{tenant}.b2clogin.com`

### Issue: CORS errors

**Solution:**
1. Verify CORS is configured in Function App
2. Check allowed origins includes your Static Web App URL
3. Ensure credentials are allowed in CORS settings

## Security Best Practices

1. **Never expose B2C secrets** in frontend code
2. **Use HTTPS** for all redirect URIs in production
3. **Enable MFA** for Promaster accounts
4. **Regular access reviews** of B2C users
5. **Monitor sign-in logs** in Azure AD B2C
6. **Set appropriate token lifetimes**
7. **Use custom domains** for professional appearance
8. **Implement password policies** in user flows

## Monitoring

### View Sign-in Logs

1. Go to Azure AD B2C > **Audit logs**
2. Filter by **Activity**: Sign in
3. Review successful and failed sign-ins

### Set Up Alerts

```bash
# Create alert for failed sign-ins
az monitor metrics alert create \
  --name "B2C-FailedSignIns" \
  --resource-group <your-resource-group> \
  --scopes <b2c-resource-id> \
  --condition "count SignInFailures > 10" \
  --window-size 5m \
  --evaluation-frequency 1m
```

## Additional Resources

- [Azure AD B2C Documentation](https://docs.microsoft.com/en-us/azure/active-directory-b2c/)
- [Custom Policies](https://docs.microsoft.com/en-us/azure/active-directory-b2c/custom-policy-overview)
- [MSAL.js Documentation](https://github.com/AzureAD/microsoft-authentication-library-for-js)
- [B2C Samples](https://github.com/azure-ad-b2c/samples)
