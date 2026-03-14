# CPS230 Solution - Customer Deployment Checklist

## Pre-Deployment Requirements

### Azure Prerequisites
- [ ] Azure subscription with Contributor/Owner access
- [ ] Azure CLI installed: https://docs.microsoft.com/cli/azure/install-azure-cli
- [ ] Logged in to Azure CLI: `az login`
- [ ] Correct subscription selected: `az account set --subscription "YOUR_SUBSCRIPTION"`

### Development Tools
- [ ] Node.js 20.x installed: https://nodejs.org
- [ ] Azure Functions Core Tools (optional): https://docs.microsoft.com/azure/azure-functions/functions-run-local
- [ ] PostgreSQL client (psql) for database init

### Azure AD App Registration
- [ ] Create Azure AD App Registration for SSO
- [ ] Note the Tenant ID
- [ ] Note the Client ID (Application ID)
- [ ] Configure redirect URIs (will be updated by deployment script)

## Security Checklist

### Before Deployment
- [ ] Review and understand .env.example file
- [ ] Never commit real .env files to git
- [ ] Generate strong JWT_SECRET (32+ characters): `openssl rand -base64 48`
- [ ] Use complex PostgreSQL password (min 8 chars, mixed case, numbers, symbols)
- [ ] Prepare initial admin email address

### During Deployment
- [ ] Deployment script prompts for all required values
- [ ] JWT_SECRET is automatically generated (32+ characters)
- [ ] PostgreSQL password is masked during input
- [ ] Azure AD credentials are configured

### After Deployment
- [ ] Change default PostgreSQL password if needed
- [ ] Rotate JWT_SECRET regularly
- [ ] Review Azure Function App security settings
- [ ] Configure Azure AD redirect URIs
- [ ] Enable MFA for admin accounts

## Deployment Steps

### 1. Clone Repository
```bash
git clone <repository-url>
cd cps230-solution
```

### 2. Run Deployment Script
```bash
# Login to Azure
az login

# Set subscription
az account set --subscription "YOUR_SUBSCRIPTION_ID"

# Run deployment
./deploy.sh
```

### 3. Answer Prompts
The script will ask for:
- Environment (dev/staging/prod)
- Azure region (default: australiaeast)
- Base name (default: cps230)
- Initial admin email
- PostgreSQL admin password
- GitHub repository URL (optional)
- Cost optimization (yes/no)
- Azure AD Tenant ID
- Azure AD Client ID

### 4. Wait for Completion (~15-20 minutes)
The script will:
- Deploy Azure infrastructure
- Initialize database
- Deploy backend functions
- Configure Azure AD app
- Deploy frontend application

### 5. Post-Deployment Configuration

#### First Sign-In
1. Navigate to the deployed Static Web App URL
2. Sign in with Azure AD
3. **First user automatically gets 'promaster' role**

#### Configure Process Manager Integration
1. Go to Settings page
2. Enter Nintex Process Manager credentials:
   - Site URL (e.g., demo.promapp.com)
   - Tenant ID
   - Username
   - Password

#### Test Sync
1. Go to Dashboard
2. Click "Sync with Process Manager"
3. Verify processes are imported

## Cost Optimization

### Cost-Optimized Mode (~$35-55/month)
- Burstable PostgreSQL (B1ms)
- Consumption Functions (Y1)
- Free Static Web App
- **Best for:** dev/test, small teams (< 10 users)

### Enterprise Mode (~$480-590/month)
- High-availability PostgreSQL (D2s_v3)
- Premium Functions (EP1)
- Standard Static Web App
- **Best for:** production, enterprise (> 50 users)

## Troubleshooting

### Common Issues

#### "JWT_SECRET environment variable must be set"
- Run: `export JWT_SECRET=$(openssl rand -base64 48)`
- Or update Function App settings in Azure Portal

#### "Failed to connect to PostgreSQL"
- Check firewall rules in Azure Portal
- Ensure SSL mode is 'require'
- Verify credentials

#### "CORS error" in browser
- Check ALLOWED_ORIGINS in Function App settings
- Verify Static Web App URL is correct
- Clear browser cache

#### "Cannot create users"
- First user must sign in with Azure AD (auto-promaster)
- Subsequent users require promaster to create them

### View Logs
```bash
# Function App logs
az functionapp log tail \
  --name <function-app-name> \
  --resource-group <resource-group>

# Application Insights
az monitor app-insights query \
  --app <app-insights-name> \
  --analytics-query "traces | take 50"
```

## Security Best Practices

### Production Deployment
- [ ] Enable Azure AD MFA
- [ ] Use cost-optimized=false for high availability
- [ ] Enable geo-redundant backup
- [ ] Configure Application Insights alerts
- [ ] Set up backup/restore procedures
- [ ] Review Azure Security Center recommendations
- [ ] Enable Azure Defender for databases
- [ ] Configure network security groups
- [ ] Use Azure Key Vault for secrets
- [ ] Enable audit logging

### Regular Maintenance
- [ ] Rotate JWT_SECRET every 90 days
- [ ] Update Azure AD client secrets annually
- [ ] Review user access quarterly
- [ ] Update Node.js dependencies monthly
- [ ] Monitor Application Insights for errors
- [ ] Review cost analysis monthly

## Support

For issues, questions, or feature requests:
- Check documentation: /docs/
- Review troubleshooting guide: DEPLOYMENT.md
- Contact support team

## Appendix

### Generated Resources
The deployment creates:
- Resource Group: `rg-cps230-{env}`
- PostgreSQL Server: `psql-cps230-{env}-{unique}`
- Function App: `func-cps230-{env}-{unique}`
- Static Web App: `stapp-cps230-{env}-{unique}`
- Key Vault: `kv-cps230-{unique}`
- Storage Account: `stcps230{env}{unique}`
- Application Insights: `appi-cps230-{env}`
- Log Analytics: `log-cps230-{env}`

### URLs After Deployment
- Application: `https://{static-web-app-name}.azurestaticapps.net`
- API: `https://{function-app-name}.azurewebsites.net/api`
- Database: `{postgres-server}.postgres.database.azure.com`

---
**Last Updated:** 2026-03-14
**Version:** 1.0.0

## Known Issues & Solutions

### PostgreSQL Password Special Characters

**Issue**: If the PostgreSQL password contains special characters (like `?`, `&`, `@`, `#`), they must be URL-encoded in connection strings.

**Solution**: The deployment script automatically handles this as of version 1.0.1. If deploying manually:

```bash
# Example: Password "Pass?word@123" becomes:
# Pass%3Fword%40123

# URL encoding reference:
# ?  -> %3F
# @  -> %40
# #  -> %23
# &  -> %26
# =  -> %3D
# %  -> %25
# +  -> %2B
# space -> %20
```

**Deployment Script Fix** (already applied):
The `deploy.sh` script now includes a `url_encode()` function that automatically encodes the password when constructing the PostgreSQL connection string.

**Manual Fix** (if needed):
```bash
# If you need to manually update the connection string:
az functionapp config appsettings set \
  --name <function-app-name> \
  --resource-group <resource-group> \
  --settings \
    POSTGRESQL_CONNECTION_STRING="postgresql://username:URL_ENCODED_PASSWORD@host:5432/database?sslmode=require"
```

---
**Last Updated:** 2026-03-14
**Version:** 1.0.1
