# CPS230 Solution - Start Here 🚀

Welcome! This guide will get your CPS230 solution deployed to Azure in under 30 minutes.

## What You're Getting

A complete, production-ready application for managing critical operations aligned with APRA CPS230 compliance:
- ✅ Interactive process visualization with BPMN diagrams
- ✅ Critical operations management
- ✅ Nintex Process Manager integration
- ✅ Role-based access control (User/Business Analyst/Promaster)
- ✅ Dual authentication (Azure AD SSO + Local Users)
- ✅ Full Azure deployment automation

## Prerequisites (5 minutes)

### Required
1. **Azure Account** with an active subscription
   - Need one? Get a [free Azure account](https://azure.microsoft.com/free)

2. **Azure CLI** installed
   ```bash
   # Check if installed
   az --version

   # Not installed? Get it here:
   # https://docs.microsoft.com/en-us/cli/azure/install-azure-cli
   ```

3. **Node.js 24.x** (required for backend Azure Functions)
   ```bash
   # Check version
   node --version

   # Need it? Download from https://nodejs.org
   ```

4. **PostgreSQL Client (psql)**
   ```bash
   # Check if installed
   psql --version

   # macOS: brew install postgresql
   # Windows: https://www.postgresql.org/download/windows/
   # Linux: apt-get install postgresql-client
   ```

### Optional (for development)
- **Azure Functions Core Tools** for local backend development
- **Git** if you want version control

---

## Quick Deploy (3 Steps)

### Step 1: Clone & Prepare (2 minutes)

```bash
# Clone the repository
git clone <repository-url>
cd cps230-solution

# Login to Azure
az login

# Select your subscription
az account set --subscription "Your-Subscription-Name"
```

### Step 2: Run Deployment Script (15-20 minutes)

```bash
# Make script executable
chmod +x deploy.sh

# Run automated deployment
./deploy.sh
```

The script will ask you for:
- **Environment**: Choose `prod` for production, `dev` for testing
- **Azure Region**: Default is `australiaeast` (or choose your preferred region)
- **Base Name**: Default is `cps230` (used for resource naming)
- **Admin Email**: Your email address (you'll be the first admin user)
- **PostgreSQL Password**: A strong password (save this!)
- **GitHub Repo**: Press Enter to skip (optional)
- **Cost Optimization**: Choose `yes` for ~$50/month, `no` for high-availability (~$500/month)
- **Azure AD SSO**: Choose `no` to use local auth only (simplest), or `yes` if you have Azure AD configured

### Step 3: Access Your Application (2 minutes)

After deployment completes, you'll see:
```
✓ Deployment successful!
Application URL: https://your-app-name.azurestaticapps.net
```

1. **Open the URL** in your browser
2. **Sign up** with the admin email you provided
3. **You're in!** The first user automatically gets admin (promaster) access

---

## What Just Happened?

The deployment script created:
- **PostgreSQL Database** for all your data
- **Azure Functions** for the backend API (20 serverless functions)
- **Static Web App** for the React frontend
- **Key Vault** for secure secrets storage
- **Application Insights** for monitoring and logs

All resources are in a single resource group: `rg-cps230-{environment}`

---

## Next Steps

### 1. Configure Nintex Process Manager (Optional)

If you want to sync processes from Nintex Process Manager:

1. Log into your deployed application
2. Go to **Settings** → **Nintex Process Manager** tab
3. Enter your credentials:
   - Site URL (e.g., `demo.promapp.com`)
   - Site ID (your tenant identifier)
   - Username
   - Password
4. Click **Sync Now** to import processes

### 2. Invite Users

As a Promaster, you can create users:

1. Go to **Users** page
2. Click **Create User**
3. Fill in details and assign a role:
   - **User**: View-only access to dashboards
   - **Business Analyst**: Can edit processes, systems, and controls
   - **Promaster**: Full admin access

### 3. Start Using the Application

- **Dashboard**: View process visualizations with interactive BPMN diagrams
- **Data Management**: Add/edit processes, systems, regions, controls
- **Critical Operations**: Define and manage critical operations with risk assessment
- **Users**: Manage user accounts and roles (Promaster only)
- **Settings**: Configure integrations and application preferences

---

## Troubleshooting

### Can't access the application?
```bash
# Check deployment status
az staticwebapp list --output table

# Get your application URL
az staticwebapp show \
  --name stapp-cps230-prod-<unique-id> \
  --resource-group rg-cps230-prod \
  --query defaultHostname
```

### Deployment failed?
1. Check you're logged into Azure: `az account show`
2. Verify you have Contributor/Owner access to the subscription
3. Check the error message - often it's:
   - Invalid password (needs 8+ characters)
   - Region not available (try a different Azure region)
   - Quota limits (contact Azure support)

### Forgot your PostgreSQL password?
```bash
# Reset it via Azure CLI
az postgres flexible-server update \
  --resource-group rg-cps230-prod \
  --name psql-cps230-prod-<unique-id> \
  --admin-password 'NewSecurePassword123!'
```

### Need to view logs?
```bash
# Function app logs
az functionapp log tail \
  --name func-cps230-prod-<unique-id> \
  --resource-group rg-cps230-prod

# Application Insights queries
az monitor app-insights query \
  --app appi-cps230-prod \
  --analytics-query "traces | where timestamp > ago(1h) | order by timestamp desc | take 50"
```

---

## Documentation

- **[CUSTOMER_DEPLOYMENT_CHECKLIST.md](CUSTOMER_DEPLOYMENT_CHECKLIST.md)** - Complete deployment checklist
- **[docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)** - Detailed deployment guide
- **[docs/QUICK_START_DEPLOYMENT.md](docs/QUICK_START_DEPLOYMENT.md)** - Alternative quick start
- **[DEPLOYMENT.md](DEPLOYMENT.md)** - Simplified deployment docs
- **[.env.example](.env.example)** - All environment variables explained

---

## Cost Estimates

### Development/Testing (Cost-Optimized Mode)
**~$50-70/month**
- Burstable PostgreSQL (B1ms): ~$15/month
- Consumption Functions: ~$0-5/month (first 1M executions free)
- Free Static Web App: $0
- Storage & Monitoring: ~$5-10/month

### Production (High-Availability Mode)
**~$400-600/month**
- High-availability PostgreSQL (D2s_v3): ~$350/month
- Premium Functions (EP1): ~$150/month
- Standard Static Web App: ~$9/month
- Storage & Monitoring: ~$20-30/month

**To reduce costs:**
- Use cost-optimized mode for non-production
- Scale down PostgreSQL during off-hours
- Delete dev/test environments when not in use
- Set up Azure Cost Alerts

---

## Updating the Application

### Update Backend Functions
```bash
cd backend
npm install
npm run build
func azure functionapp publish func-cps230-prod-<unique-id> --typescript
```

### Update Frontend
```bash
npm install
npm run build

# Deploy
az staticwebapp deploy \
  --name stapp-cps230-prod-<unique-id> \
  --resource-group rg-cps230-prod \
  --source . \
  --output-location dist
```

### Apply Database Migrations
```bash
# Set environment variables
export POSTGRES_HOST="psql-cps230-prod-<unique-id>.postgres.database.azure.com"
export POSTGRES_DB="cps230"
export POSTGRES_USER="cps230admin"
export POSTGRES_PASSWORD="your-password"

# Run new migration
psql "host=$POSTGRES_HOST dbname=$POSTGRES_DB user=$POSTGRES_USER sslmode=require" \
  -f database/migrations/009_your_new_migration.sql
```

---

## Deleting the Deployment

To completely remove everything and stop all costs:

```bash
# Delete the entire resource group
az group delete \
  --name rg-cps230-prod \
  --yes --no-wait

# This deletes:
# - All Azure resources
# - The database (and all data!)
# - Function app
# - Static web app
# - Everything else
```

⚠️ **Warning**: This is permanent! Make sure you have backups of any data you need.

---

## Getting Help

1. **Check the documentation** - Most questions are answered in:
   - This file (START_HERE.md)
   - CUSTOMER_DEPLOYMENT_CHECKLIST.md
   - docs/DEPLOYMENT.md

2. **Review logs** - Application Insights captures all errors and traces

3. **Common issues** - See the Troubleshooting section above

4. **Contact support** - If you're stuck, reach out with:
   - Error messages
   - Deployment logs
   - Steps you've tried

---

## Success Checklist

After deployment, verify:
- ✅ Can access the web application
- ✅ Can sign in with your admin account
- ✅ Can view the Dashboard page
- ✅ Can create/edit a Process or System
- ✅ (Optional) Can sync from Nintex Process Manager
- ✅ Can invite other users
- ✅ Application Insights shows no errors

**Congratulations!** You now have a fully deployed CPS230 compliance solution. 🎉

---

**Questions?** See [CUSTOMER_DEPLOYMENT_CHECKLIST.md](CUSTOMER_DEPLOYMENT_CHECKLIST.md) for more details.

**Last Updated**: 2026-03-17
**Version**: 1.1.0
