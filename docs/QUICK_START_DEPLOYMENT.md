# Quick Start: Deploy to Azure for Testing

This guide will get you up and running quickly for manual testing.

## Prerequisites Check

```bash
# Verify all required tools
az --version          # Should be 2.50+
node --version        # Should be 20+
func --version        # Should be 4+
psql --version        # Should be installed
```

## 1. Login to Azure

```bash
# Login
az login

# List subscriptions
az account list --output table

# Set the subscription you want to use
az account set --subscription "Your-Subscription-Name"
```

## 2. Run Automated Deployment

```bash
# Make deploy script executable (if not already)
chmod +x deploy.sh

# Run deployment
./deploy.sh
```

### You'll be prompted for:
1. **Environment**: Choose `dev`
2. **Region**: Press Enter for `australiaeast` (or choose your region)
3. **Base Name**: Press Enter for `cps230`
4. **Admin Email**: Enter **jonathan@palouse.io** (or your email)
5. **PostgreSQL Password**: Enter a secure password (save this!)
6. **GitHub Repo**: Press Enter to skip for now

## 3. Save Deployment Information

After deployment completes, you'll have a `deployment-info.txt` file with:
- Resource Group name
- PostgreSQL server details
- Function App URL
- Static Web App URL
- API endpoint URL

**Save this file!**

## 4. Configure Azure AD B2C

### Option A: Quick Setup (Recommended for Testing)

1. Go to [Azure Portal](https://portal.azure.com)
2. Search for "Azure AD B2C" → Create
3. Create new tenant:
   - Organization: `CPS230 Testing`
   - Domain: `cps230testing` (or available name)
   - Country: Australia
4. After creation, click "Get started" → "Applications" → "Add"
5. Configure:
   - Name: `CPS230 Web App`
   - Reply URLs:
     - Add from `deployment-info.txt` Static Web App URL
     - Add `http://localhost:8080`
   - App Type: Single-page application
6. Save **Client ID** and **Tenant Name**

### Update Function App Settings

```bash
# Get values from deployment-info.txt
RESOURCE_GROUP="<from deployment-info.txt>"
FUNCTION_APP_NAME="<from deployment-info.txt>"

# Update with B2C details
az functionapp config appsettings set \
  --name "$FUNCTION_APP_NAME" \
  --resource-group "$RESOURCE_GROUP" \
  --settings \
    AZURE_AD_B2C_TENANT_NAME="cps230testing" \
    AZURE_AD_B2C_CLIENT_ID="<your-client-id>" \
    AZURE_AD_B2C_POLICY_NAME="B2C_1_signupsignin"
```

### Create User Flow

1. In B2C portal → User flows → New
2. Select "Sign up and sign in"
3. Name: `signupsignin`
4. Identity providers: Email
5. User attributes:
   - Collect: Email, Display Name
   - Return: Email, Display Name, Object ID
6. Create

## 5. Update Frontend Configuration

Create `.env` file in project root:

```env
VITE_API_URL=https://<function-app-name>.azurewebsites.net/api
VITE_B2C_TENANT_NAME=cps230testing
VITE_B2C_CLIENT_ID=<your-client-id>
VITE_B2C_POLICY_NAME=B2C_1_signupsignin
```

Rebuild and redeploy frontend:

```bash
npm run build

# Get deployment token
STATIC_WEB_APP_NAME="<from deployment-info.txt>"
az staticwebapp secrets list \
  --name "$STATIC_WEB_APP_NAME" \
  --resource-group "$RESOURCE_GROUP" \
  --query "properties.apiKey" -o tsv
```

## 6. Allow Your IP to Access Database

```bash
# Get your IP
MY_IP=$(curl -s https://api.ipify.org)

# Get PostgreSQL server name
POSTGRES_SERVER="<from deployment-info.txt>"

# Add firewall rule
az postgres flexible-server firewall-rule create \
  --resource-group "$RESOURCE_GROUP" \
  --name "$POSTGRES_SERVER" \
  --rule-name "MyDevMachine" \
  --start-ip-address "$MY_IP" \
  --end-ip-address "$MY_IP"
```

## 7. Create Your Admin Account

1. Go to your Static Web App URL (from `deployment-info.txt`)
2. Click "Sign Up"
3. Use your admin email (jonathan@palouse.io)
4. Complete sign up

### Promote to Promaster

```bash
# Connect to database
POSTGRES_HOST="<from deployment-info.txt>"
POSTGRES_PASSWORD="<password you set>"

psql "host=$POSTGRES_HOST dbname=cps230 user=cps230admin sslmode=require"
```

In psql:
```sql
-- Check your user was created
SELECT * FROM user_profiles WHERE email = 'jonathan@palouse.io';

-- Promote to promaster
UPDATE user_profiles
SET role = 'promaster'
WHERE email = 'jonathan@palouse.io';

-- Verify
SELECT email, role FROM user_profiles;

-- Exit
\q
```

## 8. Test Your Deployment

1. Navigate to Static Web App URL
2. Sign in with your admin account
3. You should see the full application
4. Try creating a test system or process
5. Check that API calls work (open browser console)

## 9. Monitor Your Deployment

### View Function Logs
```bash
# Real-time logs
az functionapp log tail \
  --name "$FUNCTION_APP_NAME" \
  --resource-group "$RESOURCE_GROUP"
```

### View Application Insights
```bash
APP_INSIGHTS_NAME="appi-cps230-dev"

# Recent requests
az monitor app-insights query \
  --app "$APP_INSIGHTS_NAME" \
  --analytics-query "requests | where timestamp > ago(1h) | order by timestamp desc | take 20"

# Recent errors
az monitor app-insights query \
  --app "$APP_INSIGHTS_NAME" \
  --analytics-query "exceptions | where timestamp > ago(1h) | order by timestamp desc"
```

## Troubleshooting

### Can't connect to PostgreSQL
```bash
# Check firewall rules
az postgres flexible-server firewall-rule list \
  --resource-group "$RESOURCE_GROUP" \
  --name "$POSTGRES_SERVER" \
  --output table

# Your IP may have changed, update it
MY_IP=$(curl -s https://api.ipify.org)
az postgres flexible-server firewall-rule update \
  --resource-group "$RESOURCE_GROUP" \
  --name "$POSTGRES_SERVER" \
  --rule-name "MyDevMachine" \
  --start-ip-address "$MY_IP" \
  --end-ip-address "$MY_IP"
```

### Function App not responding
```bash
# Restart Function App
az functionapp restart \
  --name "$FUNCTION_APP_NAME" \
  --resource-group "$RESOURCE_GROUP"

# Check status
az functionapp show \
  --name "$FUNCTION_APP_NAME" \
  --resource-group "$RESOURCE_GROUP" \
  --query state
```

### CORS errors in browser
```bash
# Get Static Web App URL
STATIC_WEB_APP_URL=$(az staticwebapp show \
  --name "$STATIC_WEB_APP_NAME" \
  --resource-group "$RESOURCE_GROUP" \
  --query "defaultHostname" -o tsv)

# Update CORS
az functionapp cors remove --name "$FUNCTION_APP_NAME" --resource-group "$RESOURCE_GROUP" --allowed-origins
az functionapp cors add \
  --name "$FUNCTION_APP_NAME" \
  --resource-group "$RESOURCE_GROUP" \
  --allowed-origins "https://$STATIC_WEB_APP_URL" "http://localhost:8080"
```

### Frontend not loading
```bash
# Check deployment status
az staticwebapp show \
  --name "$STATIC_WEB_APP_NAME" \
  --resource-group "$RESOURCE_GROUP" \
  --query "{name:name, state:sku.tier, url:defaultHostname}"
```

## Cost Monitoring

Check costs regularly:
```bash
# View current month costs
az consumption usage list \
  --start-date $(date -u -d "$(date +%Y-%m-01)" '+%Y-%m-%dT%H:%M:%SZ') \
  --end-date $(date -u '+%Y-%m-%dT%H:%M:%SZ') \
  --query "[?contains(instanceId, '$RESOURCE_GROUP')]"
```

## Clean Up When Done Testing

To avoid ongoing costs:

```bash
# Delete entire resource group
az group delete \
  --name "$RESOURCE_GROUP" \
  --yes --no-wait
```

## Next Steps

Once your testing deployment is working:

1. ✅ Test all API endpoints
2. ✅ Verify authentication flows
3. ✅ Test database operations
4. ✅ Configure Nintex PM API credentials in Settings
5. ✅ Test sync functionality
6. ✅ Review Application Insights for errors
7. ✅ Plan production deployment with proper DNS, SSL, etc.

## Quick Reference

**Resource Group**: `rg-cps230-dev`
**Function App**: `func-cps230-dev-<unique>`
**Static Web App**: `stapp-cps230-dev-<unique>`
**PostgreSQL**: `psql-cps230-dev-<unique>.postgres.database.azure.com`
**Database**: `cps230`
**Admin User**: `cps230admin`

For detailed documentation, see [DEPLOYMENT.md](DEPLOYMENT.md)
