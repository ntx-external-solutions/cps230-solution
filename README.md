# CPS230 Critical Operations Ecosystem

> **New user? Start here:** See **[START_HERE.md](START_HERE.md)** for a 30-minute deployment guide.

A production-ready solution for managing critical operations processes in alignment with APRA CPS230 regulations. Designed for deployment to Microsoft Azure with automated deployment scripts.

## Features

- **Process Visualization**: Interactive BPMN-based process mapping with dependency tracking
- **Critical Operations Management**: Track and manage critical operations aligned with CPS230 compliance
- **Controls Management**: Many-to-many relationships between controls, processes, systems, and critical operations
- **Role-Based Access Control**: Three-tier access system (User, Business Analyst, Promaster)
- **Nintex Integration**: Synchronize processes and systems from Nintex Process Manager with batch processing and progress tracking
- **Azure-Native Architecture**: Fully integrated with Azure services for enterprise-grade reliability
- **Dual Authentication**: Supports both Azure AD (Entra ID) SSO and local database users
- **Dark Mode**: Full theme support (light/dark/system)

## Architecture

- **Frontend**: Azure Static Web Apps (React 19 + TypeScript + Vite)
- **Backend**: Azure Functions v4 (Node.js 24) - 20 serverless HTTP endpoints
- **Database**: Azure Database for PostgreSQL Flexible Server (v16) with Row-Level Security
- **Authentication**: Dual authentication (Azure AD SSO via MSAL + bcrypt-hashed local users with JWT)
- **Secrets Management**: Azure Key Vault with managed identity access
- **Monitoring**: Application Insights + Log Analytics
- **Infrastructure as Code**: Azure Bicep templates with cost-optimized and enterprise deployment options

## Prerequisites

### Required

1. **Azure Account** with an active subscription (Contributor or Owner access)
2. **Azure CLI** v2.50+
   ```bash
   az --version
   # Install: https://docs.microsoft.com/cli/azure/install-azure-cli
   ```
3. **Node.js 24.x** (required for backend Azure Functions)
   ```bash
   node --version
   # Download: https://nodejs.org
   ```
4. **PostgreSQL Client (psql)** for database initialization
   ```bash
   psql --version
   # macOS: brew install postgresql
   # Windows: https://www.postgresql.org/download/windows/
   # Linux: apt-get install postgresql-client
   ```

### Optional

- **Azure Functions Core Tools** v4 for local backend development
- **Git** for version control and automated updates

## Quick Start

**See [START_HERE.md](START_HERE.md) for the complete quick-start guide.**

Or use the automated deployment script:

```bash
# 1. Login to Azure
az login
az account set --subscription "Your-Subscription-Name"

# 2. Run automated deployment
# Linux/macOS:
chmod +x deploy.sh
./deploy.sh

# Windows (PowerShell):
.\Deploy-ToAzure.ps1
```

You'll be prompted for:
- **Environment**: dev / staging / prod
- **Azure Region**: Default is `australiaeast`
- **Base Name**: Default is `cps230` (used for resource naming)
- **Admin Email**: Your email address (becomes the first admin user)
- **PostgreSQL Password**: A strong password (save this securely)
- **Cost Optimization**: `yes` for ~$50/month, `no` for high-availability (~$500/month)
- **Azure AD Settings**: Tenant ID and Client ID (optional, for SSO)

The deployment takes approximately 15-20 minutes and creates:
- PostgreSQL Flexible Server database
- 20 Azure Functions for the API
- Static Web App for the frontend
- Key Vault for secrets management
- Application Insights + Log Analytics for monitoring
- All necessary security configurations and CORS settings

## Post-Deployment Setup

### 1. Initialize the Database

If not handled by the deployment script:

```bash
export POSTGRES_HOST="<your-postgres-server>.postgres.database.azure.com"
export POSTGRES_DB="cps230"
export POSTGRES_USER="cps230admin"
export POSTGRES_PASSWORD="<your-password>"

./database/init-database.sh
```

This applies the base schema (`database/schema.sql`) and all migrations (`database/migrations/001-011`).

### 2. Configure Authentication

The application supports two authentication methods that can be used independently or together.

**Azure AD SSO (for organizational users)**:
1. Register an application in Azure AD (Entra ID)
2. Set the redirect URI to your Static Web App URL
3. Note the Tenant ID and Client ID (Application ID)
4. Configure these in both the Function App and Static Web App settings:
   - Backend: `AZURE_TENANT_ID`, `AZURE_CLIENT_ID`
   - Frontend: `VITE_AZURE_TENANT_ID`, `VITE_AZURE_CLIENT_ID`, `VITE_REDIRECT_URI`

**Local Database Users (for external users or standalone use)**:
1. Generate a secure JWT_SECRET: `openssl rand -base64 48`
2. Add `JWT_SECRET` to Function App application settings
3. The deployment script creates an initial admin user automatically
4. Additional users can be created via the Users management page

See [DUAL_AUTH_SETUP_GUIDE.md](DUAL_AUTH_SETUP_GUIDE.md) for detailed setup instructions.

See [AZURE_AD_USER_MANAGEMENT_SETUP.md](AZURE_AD_USER_MANAGEMENT_SETUP.md) for Azure AD user management configuration.

### 3. Deploy Backend Functions

```bash
cd backend
npm install
npm run build
func azure functionapp publish <your-function-app-name>
```

### 4. Deploy Frontend

```bash
# Build the frontend
npm install
npm run build

# Option 1: Using Static Web Apps CLI
npx @azure/static-web-apps-cli deploy ./dist \
    --deployment-token "<your-deployment-token>" \
    --env production

# Option 2: Using Azure CLI
az staticwebapp deploy \
  --name <your-static-web-app-name> \
  --resource-group <your-resource-group> \
  --source . \
  --output-location dist
```

### 5. Create Initial Admin User

The deployment script automatically creates an initial admin user with the email you provided. If you need to create one manually:

```bash
# Use the provided script
./database/create-initial-admin.sh

# Or promote a user directly in PostgreSQL
psql "host=$POSTGRES_HOST dbname=$POSTGRES_DB user=$POSTGRES_USER sslmode=require"
UPDATE user_profiles SET role = 'promaster' WHERE email = 'admin@yourcompany.com';
```

## Configuration

### Environment Variables

**Backend (Azure Functions App Settings)**:

| Variable | Description | Required |
|---|---|---|
| `POSTGRESQL_CONNECTION_STRING` | PostgreSQL connection string | Yes (auto-configured by deploy script) |
| `KEY_VAULT_URI` | Azure Key Vault URI | Yes (auto-configured) |
| `JWT_SECRET` | Random string for local user tokens (min 32 chars) | Yes |
| `AZURE_TENANT_ID` | Azure AD tenant ID | For SSO |
| `AZURE_CLIENT_ID` | Azure AD application client ID | For SSO |
| `ALLOWED_ORIGINS` | Comma-separated allowed CORS origins | Yes |
| `STATIC_WEB_APP_URL` | Frontend URL (for CORS) | Yes |
| `NODE_ENV` | `development` or `production` | Yes |
| `APPLICATIONINSIGHTS_CONNECTION_STRING` | App Insights connection | Yes (auto-configured) |

**Frontend (build-time environment variables)**:

| Variable | Description | Required |
|---|---|---|
| `VITE_API_URL` | Azure Functions API URL | Yes |
| `VITE_AZURE_TENANT_ID` | Azure AD tenant ID | For SSO |
| `VITE_AZURE_CLIENT_ID` | Azure AD application client ID | For SSO |
| `VITE_REDIRECT_URI` | Redirect URI after Azure AD login | For SSO |

See [.env.example](.env.example) for a complete template with documentation.

## Development

### Local Development Setup

1. Clone the repository
2. Install dependencies:
   ```bash
   # Frontend
   npm install

   # Backend
   cd backend && npm install
   ```
3. Create environment files:
   ```bash
   # Copy and fill in values
   cp .env.example .env
   ```
4. Start development servers:
   ```bash
   # Frontend (in root directory) - runs on port 8080
   npm run dev

   # Backend (in backend directory) - runs on port 7071
   cd backend
   npm start
   ```

### Project Structure

```
cps230-solution/
├── infrastructure/              # Azure Bicep IaC templates
│   ├── main.bicep               # Main deployment template (subscription-scoped)
│   ├── modules/                 # Reusable Bicep modules
│   │   ├── postgresql.bicep     # PostgreSQL Flexible Server
│   │   ├── functionapp.bicep    # Function App + Storage + App Service Plan
│   │   ├── staticwebapp.bicep   # Static Web App
│   │   ├── keyvault.bicep       # Key Vault with RBAC
│   │   └── monitoring.bicep     # App Insights + Log Analytics
│   └── parameters/              # Environment-specific parameters
│       ├── dev.parameters.json
│       └── prod.parameters.json
├── backend/                     # Azure Functions backend (Node.js 24)
│   ├── functions/               # 20 HTTP trigger functions
│   │   ├── processes.ts         # Process CRUD
│   │   ├── systems.ts           # System CRUD
│   │   ├── controls.ts          # Control CRUD
│   │   ├── critical-operations.ts
│   │   ├── regions.ts           # Region CRUD
│   │   ├── process-systems.ts   # Junction: process-system
│   │   ├── process-controls.ts  # Junction: process-control
│   │   ├── control-processes.ts # Junction: control-process
│   │   ├── control-systems.ts   # Junction: control-system
│   │   ├── control-critical-operations.ts
│   │   ├── critical-operation-processes.ts
│   │   ├── critical-operation-systems.ts
│   │   ├── auth-local.ts        # Local login/signup
│   │   ├── create-user.ts       # Admin user creation
│   │   ├── user-profiles.ts     # User profile management
│   │   ├── manage-azure-users.ts # Azure AD user management
│   │   ├── settings.ts          # Application settings
│   │   ├── sync-process-manager.ts # Nintex PM sync
│   │   ├── sync-history.ts      # Sync audit trail
│   │   └── version.ts           # Version endpoint
│   └── shared/                  # Shared utilities
│       ├── auth.ts              # Dual auth (Azure AD + Local JWT)
│       ├── database.ts          # PostgreSQL connection pooling
│       ├── jwt.ts               # JWT token generation/verification
│       ├── password.ts          # bcrypt password hashing
│       └── validation.ts        # Input validation
├── database/                    # Database schema and migrations
│   ├── schema.sql               # PostgreSQL schema (15+ tables with RLS)
│   ├── init-database.sh         # Database initialization script
│   ├── create-initial-admin.sh  # Create first admin user
│   └── migrations/              # Sequential schema migrations (001-011)
├── src/                         # React frontend application
│   ├── components/              # UI components (tables, dialogs, BPMN canvas)
│   ├── contexts/                # React contexts (Auth, Theme)
│   ├── hooks/                   # Custom React hooks
│   ├── lib/                     # API clients and utilities
│   │   ├── azureApi.ts          # Azure Functions HTTP client
│   │   └── api.ts               # High-level API abstraction
│   ├── pages/                   # Route pages
│   └── types/                   # TypeScript type definitions
├── docs/                        # Additional documentation
│   ├── DEPLOYMENT.md            # Detailed deployment guide
│   ├── QUICK_START_DEPLOYMENT.md
│   └── UNIFIED_USER_AUTHENTICATION.md
├── deploy.sh                    # Automated deployment (Linux/macOS)
├── Deploy-ToAzure.ps1           # Automated deployment (Windows)
├── customer-update.sh           # Automated update script
├── .env.example                 # Environment variable template
└── staticwebapp.config.json     # SPA routing configuration
```

## Updating the Application

### Automated Updates (Recommended)

Use the `customer-update.sh` script for easy updates:

```bash
./customer-update.sh
```

This script automatically:
1. Pulls latest code from git (if repository configured)
2. Retrieves database credentials from Azure
3. Applies all pending database migrations
4. Rebuilds and redeploys the backend
5. Rebuilds and redeploys the frontend

See [UPGRADE-NOTES.md](UPGRADE-NOTES.md) for details on what's changed in each release.

### Manual Updates

```bash
# 1. Pull latest code
git pull

# 2. Apply database migrations
export POSTGRES_HOST="<your-server>.postgres.database.azure.com"
export POSTGRES_DB="cps230"
export POSTGRES_USER="cps230admin"
export POSTGRES_PASSWORD="<your-password>"
./database/init-database.sh

# 3. Update backend
cd backend
npm install
npm run build
func azure functionapp publish <your-function-app-name>
cd ..

# 4. Update frontend
npm install
npm run build
npx @azure/static-web-apps-cli deploy ./dist \
    --deployment-token "<your-token>" \
    --env production
```

### Infrastructure Updates

```bash
az deployment sub create \
  --location australiaeast \
  --template-file infrastructure/main.bicep \
  --parameters @infrastructure/parameters/prod.parameters.json
```

## Monitoring and Troubleshooting

### View Logs

```bash
# Real-time Function App logs
az functionapp log tail \
  --name <your-function-app-name> \
  --resource-group <your-resource-group>

# Application Insights query
az monitor app-insights query \
  --app <your-app-insights-name> \
  --analytics-query "traces | order by timestamp desc | take 100"
```

### Common Issues

| Issue | Solution |
|---|---|
| `JWT_SECRET environment variable must be set` | Set JWT_SECRET in Function App settings (min 32 chars): `openssl rand -base64 48` |
| `Failed to connect to PostgreSQL` | Check firewall rules, verify SSL mode is `require`, confirm credentials |
| CORS errors in browser | Verify `ALLOWED_ORIGINS` includes your Static Web App URL |
| Cannot create users | First user must be promaster role; use `create-initial-admin.sh` if needed |
| PostgreSQL password special characters | URL-encode special chars in connection string (deploy script handles this automatically) |

## Security

- All secrets stored in Azure Key Vault with managed identity access
- HTTPS enforced for all communications (TLS 1.2 minimum)
- Row-level security enforced in PostgreSQL database
- Dual authentication: Azure AD SSO for organizational users + bcrypt-hashed passwords with JWT for local users
- CORS configured with whitelisted origins only
- FTP disabled on Function App
- Soft delete and purge protection enabled on Key Vault (production)

## Cost Estimates

| Deployment Mode | Monthly Cost | Best For |
|---|---|---|
| **Cost-Optimized** | ~$35-70/month | Dev/test, small teams (<10 users) |
| **Enterprise** | ~$480-600/month | Production, high availability (>50 users) |

**Cost-Optimized breakdown:**
- Burstable PostgreSQL (B1ms): ~$15/month
- Consumption Functions (Y1): ~$0-5/month (first 1M executions free)
- Free Static Web App: $0
- Storage & Monitoring: ~$5-10/month

**To reduce costs in non-production:**
- Use cost-optimized mode (`costOptimized=true` in deployment)
- Delete dev/test environments when not in use
- Set up Azure Cost Alerts

## Documentation

### Getting Started
- **[START_HERE.md](START_HERE.md)** - Complete 30-minute deployment guide
- [CUSTOMER_DEPLOYMENT_CHECKLIST.md](CUSTOMER_DEPLOYMENT_CHECKLIST.md) - Pre/post deployment checklist
- [.env.example](.env.example) - All environment variables explained

### Authentication
- [DUAL_AUTH_SETUP_GUIDE.md](DUAL_AUTH_SETUP_GUIDE.md) - Dual authentication setup
- [AZURE_AD_USER_MANAGEMENT_SETUP.md](AZURE_AD_USER_MANAGEMENT_SETUP.md) - Azure AD configuration
- [docs/UNIFIED_USER_AUTHENTICATION.md](docs/UNIFIED_USER_AUTHENTICATION.md) - Authentication architecture details

### Deployment
- [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) - Detailed deployment instructions
- [docs/QUICK_START_DEPLOYMENT.md](docs/QUICK_START_DEPLOYMENT.md) - Quick deployment for testing

### Updates
- [UPGRADE-NOTES.md](UPGRADE-NOTES.md) - Release notes and migration guides

## Deleting the Deployment

To completely remove all resources and stop costs:

```bash
az group delete --name rg-cps230-prod --yes --no-wait
```

**Warning**: This permanently deletes all resources including the database and all data. Ensure you have backups before proceeding.

## License

Copyright 2024-2026 Nintex. All rights reserved.
