# Azure AD Setup Complete

## Summary

Azure AD authentication has been successfully configured for your CPS230 application. Since Azure AD B2C was deprecated (May 1, 2025), we configured standard Azure AD (Entra ID) instead.

## Configuration Completed

### Azure AD App Registration
- **Name**: CPS230 Web Application
- **Application (client) ID**: `3e1e105d-2adb-4107-904a-4c2b58a3aeb9`
- **Directory (tenant) ID**: `b457875d-e043-4358-82d1-efe29223e6f8`
- **Tenant**: CPS (Palouse Software)

### Redirect URIs Configured
- Production: `https://ambitious-meadow-01fb2d300.4.azurestaticapps.net`
- Development: `http://localhost:8080`

### Backend Configuration
Function App settings updated:
```
AZURE_AD_TENANT_ID=b457875d-e043-4358-82d1-efe29223e6f8
AZURE_AD_CLIENT_ID=3e1e105d-2adb-4107-904a-4c2b58a3aeb9
```

### Frontend Configuration
Environment variables (.env.production):
```
VITE_API_URL=https://func-cps230-dev-w4n7p6pwjelzi.azurewebsites.net/api
VITE_AZURE_TENANT_ID=b457875d-e043-4358-82d1-efe29223e6f8
VITE_AZURE_CLIENT_ID=3e1e105d-2adb-4107-904a-4c2b58a3aeb9
VITE_REDIRECT_URI=https://ambitious-meadow-01fb2d300.4.azurestaticapps.net
```

### Code Changes
Updated `src/contexts/AuthContext.tsx`:
- Changed from B2C configuration to standard Azure AD
- Authority: `https://login.microsoftonline.com/{tenantId}`
- Scopes: `openid`, `profile`, `email`, `User.Read`

### Deployment
- Frontend rebuilt with Azure AD configuration
- Deployed to: https://ambitious-meadow-01fb2d300-preview.eastasia.4.azurestaticapps.net

---

## Next Steps

### 1. Test Authentication (2 minutes)

Visit your application and try signing in:
```
https://ambitious-meadow-01fb2d300.4.azurestaticapps.net
```

**Important Notes**:
- This uses your **CPS (Palouse Software)** Azure AD tenant
- Users must exist in your Azure AD tenant to sign in
- If `jonathan@palouse.io` is already in the tenant, you can sign in immediately
- If not, you'll need to add users to the Azure AD tenant first

### 2. Add Users to Azure AD (if needed)

If you need to add external users or create test accounts:

**Option A: Add Guest Users (External identities)**
```bash
az ad user create \
  --display-name "Jonathan Butler" \
  --user-principal-name jonathan@palouse.io \
  --password "TempPassword123!" \
  --force-change-password-next-sign-in true
```

**Option B: Invite External Users (B2B)**
```bash
az ad user create-external-email \
  --email-address jonathan@palouse.io \
  --display-name "Jonathan Butler"
```

**Option C: Use Azure Portal**
1. Go to [Azure Portal](https://portal.azure.com)
2. Navigate to **Azure Active Directory** → **Users** → **New user**
3. Create a new user or invite a guest user

### 3. Create Admin Account in Database

After successfully signing in to the application:

```bash
# Connect to database
psql "host=psql-cps230-dev-w4n7p6pwjelzi.postgres.database.azure.com dbname=cps230 user=cps230admin sslmode=require"

# In psql, promote your account
UPDATE user_profiles
SET role = 'promaster'
WHERE email = 'jonathan@palouse.io';

# Verify
SELECT email, role FROM user_profiles;

# Exit
\q
```

### 4. Test Full Functionality

Once logged in as Promaster, verify:
- Can access all menu items
- Can create/edit systems
- Can create/edit processes
- Can manage users
- Settings page is accessible

---

## Troubleshooting

### "User not found" or "Invalid credentials"
- Ensure the user exists in the CPS Azure AD tenant
- Check that you're using the correct email/password
- Try adding the user to Azure AD first

### "Redirect URI mismatch"
- The configured redirect URIs should match your application URL
- Currently configured for:
  - `https://ambitious-meadow-01fb2d300.4.azurestaticapps.net`
  - `http://localhost:8080`

### CORS Errors
- Function App CORS is configured for both URLs above
- If testing on a different URL, update CORS in Function App settings

### Database Connection Issues
- Your IP (199.204.206.199) is already whitelisted
- If connecting from a different IP, add a firewall rule:
  ```bash
  az postgres flexible-server firewall-rule create \
    --resource-group rg-cps230-dev \
    --name psql-cps230-dev-w4n7p6pwjelzi \
    --rule-name "AllowNewIP" \
    --start-ip-address <your-ip> \
    --end-ip-address <your-ip>
  ```

---

## Application URLs

**Frontend**: https://ambitious-meadow-01fb2d300.4.azurestaticapps.net
**Backend API**: https://func-cps230-dev-w4n7p6pwjelzi.azurewebsites.net/api
**Database**: psql-cps230-dev-w4n7p6pwjelzi.postgres.database.azure.com

---

## Configuration Files Updated

1. `.env.production` - Frontend environment variables
2. `src/contexts/AuthContext.tsx` - MSAL configuration for Azure AD
3. Function App settings (via Azure CLI)
4. Azure AD app registration (SPA platform and redirect URIs)

---

**Status**: ✅ Ready for testing!

Try visiting the application now and signing in with a user from your CPS Azure AD tenant.
