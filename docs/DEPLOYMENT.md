# CPS230 Solution - Deployment Guide

This guide provides detailed instructions for deploying the CPS230 Solution to Microsoft Azure.

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Initial Deployment](#initial-deployment)
3. [Post-Deployment Configuration](#post-deployment-configuration)
4. [Updating the Application](#updating-the-application)
5. [Troubleshooting](#troubleshooting)

## Prerequisites

### Required Tools

- **Azure CLI** (version 2.50.0 or later)
  ```bash
  az --version
  ```
  Install from: https://docs.microsoft.com/en-us/cli/azure/install-azure-cli

- **Node.js** (version 20.x or later)
  ```bash
  node --version
  ```
  Install from: https://nodejs.org/

- **Azure Functions Core Tools** (version 4.x)
  ```bash
  func --version
  ```
  Install from: https://docs.microsoft.com/en-us/azure/azure-functions/functions-run-local

- **PostgreSQL Client** (psql)
  ```bash
  psql --version
  ```
  Install from: https://www.postgresql.org/download/

### Azure Requirements

- Azure subscription with Owner or Contributor role
- Sufficient quota for:
  - 1 PostgreSQL Flexible Server
  - 1 Function App
  - 1 Static Web App
  - 1 Key Vault
  - 1 Log Analytics Workspace
  - 1 Application Insights instance

### Recommended Tools

- **Git** for version control
- **jq** for JSON parsing in scripts
- **VS Code** with Azure extensions for development

## Initial Deployment

### Option 1: Automated Deployment Script (Recommended)

The automated deployment script handles the entire deployment process:

```bash
# Clone the repository
git clone https://github.com/YOUR_ORG/cps230-solution.git
cd cps230-solution

# Run the deployment script
./deploy.sh
```

The script will prompt you for:
- Environment (dev/staging/prod)
- Azure region
- Base name for resources
- Initial admin email
- PostgreSQL admin password
- GitHub repository URL (optional)

### Option 2: Manual Deployment

#### Step 1: Login to Azure

```bash
az login
az account set --subscription "Your-Subscription-Name"
```

#### Step 2: Deploy Infrastructure

```bash
# Set parameters
ENVIRONMENT="prod"
LOCATION="australiaeast"
BASE_NAME="cps230"
ADMIN_EMAIL="admin@yourcompany.com"
POSTGRES_PASSWORD="YourSecurePassword123!"

# Deploy
az deployment sub create \
  --name "cps230-deployment-$(date +%Y%m%d-%H%M%S)" \
  --location "$LOCATION" \
  --template-file infrastructure/main.bicep \
  --parameters \
    environmentName="$ENVIRONMENT" \
    baseName="$BASE_NAME" \
    location="$LOCATION" \
    postgresAdminPassword="$POSTGRES_PASSWORD" \
    initialAdminEmail="$ADMIN_EMAIL"
```

#### Step 3: Capture Deployment Outputs

```bash
# Get the latest deployment
DEPLOYMENT_NAME=$(az deployment sub list \
  --query "[?contains(name, 'cps230-deployment')].name" \
  --output tsv | head -n 1)

# Get outputs
az deployment sub show \
  --name "$DEPLOYMENT_NAME" \
  --query properties.outputs \
  --output json > deployment-outputs.json

# Extract values
RESOURCE_GROUP=$(jq -r '.resourceGroupName.value' deployment-outputs.json)
FUNCTION_APP_NAME=$(jq -r '.functionAppName.value' deployment-outputs.json)
STATIC_WEB_APP_NAME=$(jq -r '.staticWebAppName.value' deployment-outputs.json)
POSTGRES_FQDN=$(jq -r '.postgresqlServerFqdn.value' deployment-outputs.json)
```

#### Step 4: Initialize Database

```bash
export POSTGRES_HOST="$POSTGRES_FQDN"
export POSTGRES_DB="cps230"
export POSTGRES_USER="cps230admin"
export POSTGRES_PASSWORD="$POSTGRES_PASSWORD"

./database/init-database.sh
```

#### Step 5: Deploy Backend Functions

```bash
cd backend
npm install
npm run build
func azure functionapp publish "$FUNCTION_APP_NAME" --typescript
cd ..
```

#### Step 6: Deploy Frontend

```bash
# Build frontend
npm install
npm run build

# Deploy to Static Web App
az staticwebapp deploy \
  --name "$STATIC_WEB_APP_NAME" \
  --resource-group "$RESOURCE_GROUP" \
  --source . \
  --output-location dist
```

## Post-Deployment Configuration

### 1. Configure Azure AD B2C

See [AZURE_AD_B2C_SETUP.md](AZURE_AD_B2C_SETUP.md) for detailed instructions.

Quick steps:
1. Create Azure AD B2C tenant (if needed)
2. Register application
3. Create sign-up/sign-in user flow
4. Configure reply URLs
5. Update Function App settings:

```bash
az functionapp config appsettings set \
  --name "$FUNCTION_APP_NAME" \
  --resource-group "$RESOURCE_GROUP" \
  --settings \
    AZURE_AD_B2C_TENANT_NAME="your-tenant-name" \
    AZURE_AD_B2C_CLIENT_ID="your-client-id" \
    AZURE_AD_B2C_POLICY_NAME="B2C_1_signupsignin"
```

### 2. Configure CORS

Update allowed origins for the Function App:

```bash
# Get Static Web App URL
STATIC_WEB_APP_URL=$(az staticwebapp show \
  --name "$STATIC_WEB_APP_NAME" \
  --resource-group "$RESOURCE_GROUP" \
  --query "defaultHostname" -o tsv)

# Update Function App CORS
az functionapp cors add \
  --name "$FUNCTION_APP_NAME" \
  --resource-group "$RESOURCE_GROUP" \
  --allowed-origins "https://$STATIC_WEB_APP_URL"
```

### 3. Create Initial Admin User

1. Navigate to your Static Web App URL
2. Sign up with the admin email specified during deployment
3. Connect to PostgreSQL and promote the user:

```sql
psql "host=$POSTGRES_HOST dbname=cps230 user=cps230admin sslmode=require"

UPDATE user_profiles
SET role = 'promaster'
WHERE email = 'admin@yourcompany.com';
```

### 4. Configure Application Settings

In the application as Promaster:
1. Go to Settings
2. Configure Nintex Process Manager API credentials
3. Set sync frequency
4. Configure regional settings

## Updating the Application

### Infrastructure Updates

To update infrastructure (e.g., scale up database, change SKUs):

```bash
az deployment sub create \
  --name "cps230-update-$(date +%Y%m%d-%H%M%S)" \
  --location "$LOCATION" \
  --template-file infrastructure/main.bicep \
  --parameters @infrastructure/parameters/prod.parameters.json
```

### Backend Updates

```bash
cd backend
npm install
npm run build
func azure functionapp publish "$FUNCTION_APP_NAME" --typescript
```

### Frontend Updates

```bash
npm install
npm run build
az staticwebapp deploy \
  --name "$STATIC_WEB_APP_NAME" \
  --resource-group "$RESOURCE_GROUP" \
  --source . \
  --output-location dist
```

### Database Schema Updates

For schema changes:

1. Create a new migration file in `database/migrations/`
2. Apply the migration:

```bash
export POSTGRES_HOST="$POSTGRES_FQDN"
export POSTGRES_DB="cps230"
export POSTGRES_USER="cps230admin"
export POSTGRES_PASSWORD="$POSTGRES_PASSWORD"

psql "host=$POSTGRES_HOST dbname=$POSTGRES_DB user=$POSTGRES_USER sslmode=require" \
  -f database/migrations/001_your_migration.sql
```

## Continuous Deployment with GitHub Actions

### Setup

1. Create Azure Service Principal:

```bash
az ad sp create-for-rbac \
  --name "cps230-github-actions" \
  --role contributor \
  --scopes /subscriptions/{subscription-id}/resourceGroups/{resource-group} \
  --sdk-auth
```

2. Add GitHub Secrets:
   - `AZURE_CREDENTIALS`: Output from above command
   - `AZURE_SUBSCRIPTION_ID`: Your subscription ID
   - `AZURE_FUNCTION_APP_NAME`: Function App name
   - `AZURE_STATIC_WEB_APPS_API_TOKEN`: From Static Web App
   - `POSTGRES_ADMIN_PASSWORD`: PostgreSQL password
   - `INITIAL_ADMIN_EMAIL`: Admin email

3. Push to trigger deployment:

```bash
git add .
git commit -m "Deploy to Azure"
git push origin main
```

## Troubleshooting

### Common Issues

**Issue: Deployment fails with "insufficient permissions"**
- Ensure you have Owner or Contributor role on the subscription
- Check Azure AD permissions if creating B2C resources

**Issue: Database connection fails**
- Verify firewall rules allow Azure services
- Check connection string format
- Ensure SSL mode is enabled

**Issue: Function App returns 500 errors**
- Check Application Insights logs
- Verify environment variables are set correctly
- Check PostgreSQL connectivity from Function App

**Issue: Static Web App shows blank page**
- Verify API_URL is correctly configured
- Check browser console for errors
- Ensure CORS is properly configured

### Viewing Logs

**Function App Logs:**
```bash
az monitor app-insights query \
  --app "$APP_INSIGHTS_NAME" \
  --analytics-query "traces | where timestamp > ago(1h) | order by timestamp desc"
```

**PostgreSQL Logs:**
```bash
az postgres flexible-server server-logs list \
  --resource-group "$RESOURCE_GROUP" \
  --server-name "$POSTGRES_SERVER_NAME"
```

### Getting Support

For deployment issues:
1. Check the troubleshooting section above
2. Review Application Insights logs
3. Open an issue on GitHub with:
   - Deployment logs
   - Error messages
   - Environment details

## Best Practices

1. **Use separate environments** for dev/staging/prod
2. **Store secrets in Key Vault**, never in code
3. **Enable monitoring** and set up alerts
4. **Regular backups** of the database
5. **Test deployments** in staging before production
6. **Document custom configurations**
7. **Review costs** regularly using Azure Cost Management

## Security Checklist

- [ ] Azure AD B2C properly configured
- [ ] CORS allows only specific origins
- [ ] Database firewall rules are restrictive
- [ ] Secrets stored in Key Vault
- [ ] HTTPS enforced for all endpoints
- [ ] Regular security updates applied
- [ ] Access reviews conducted regularly
- [ ] Monitoring and alerting enabled
