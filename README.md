# CPS230 Critical Operations Ecosystem

> **🚀 NEW USER? START HERE:** See **[START_HERE.md](START_HERE.md)** for a 30-minute deployment guide!

A production-ready solution for managing critical operations processes in alignment with APRA CPS230 regulations. This version is designed for deployment to Microsoft Azure with automated deployment scripts.

## Features

- **Process Visualization**: Interactive BPMN-based process mapping with dependency tracking
- **Critical Operations Management**: Track and manage critical operations aligned with CPS230 compliance
- **Role-Based Access Control**: Three-tier access system (User, Business Analyst, Promaster)
- **Nintex Integration**: Synchronize processes from Nintex Process Manager
- **Azure-Native Architecture**: Fully integrated with Azure services for enterprise-grade reliability
- **Dual Authentication**: Supports both Azure AD SSO and local database users
- **Dark Mode**: Full theme support (light/dark/system)

## Architecture

- **Frontend**: Azure Static Web Apps (React + TypeScript + Vite)
- **Backend**: Azure Functions (Node.js 20) - 17 serverless HTTP endpoints
- **Database**: Azure Database for PostgreSQL Flexible Server with Row-Level Security
- **Authentication**: Dual authentication (Azure AD SSO + bcrypt-hashed local users with JWT)
- **Secrets Management**: Azure Key Vault
- **Monitoring**: Application Insights + Log Analytics

## Quick Start (First Time Users)

**👉 See [START_HERE.md](START_HERE.md) for the complete quick-start guide**

Or use the automated deployment script:

```bash
# 1. Login to Azure
az login

# 2. Run automated deployment (handles everything!)
./deploy.sh

# You'll be prompted for:
# - Environment (dev/prod)
# - Azure region
# - Admin email
# - PostgreSQL password
# - Azure AD settings (optional)
```

The deployment will take approximately 15-20 minutes and creates:
- PostgreSQL database
- 17 Azure Functions for the API
- Static Web App for the frontend
- Application Insights for monitoring
- All necessary security configurations

### Post-Deployment Setup

After the infrastructure is deployed, follow these steps:

#### 1. Initialize the Database

```bash
# Set environment variables from deployment outputs
export POSTGRES_HOST="<your-postgres-server>.postgres.database.azure.com"
export POSTGRES_DB="cps230"
export POSTGRES_USER="cps230admin"
export POSTGRES_PASSWORD="<your-password>"

# Run database initialization
./database/init-database.sh
```

#### 2. Configure Authentication

The application supports two authentication methods:

**Azure AD SSO (for organizational users)**:
1. Register an application in your Azure AD tenant
2. Configure redirect URIs for your Static Web App
3. Update Function App and Static Web App environment variables with Azure AD details

**Local Database Users (for external users)**:
1. Generate a secure JWT_SECRET for token signing
2. Add JWT_SECRET to Function App environment variables
3. Admin users can create local accounts via the Users management page

See [DUAL_AUTH_SETUP_GUIDE.md](DUAL_AUTH_SETUP_GUIDE.md) for detailed instructions.

#### 3. Deploy Backend Functions

```bash
# Navigate to backend directory
cd backend

# Install dependencies
npm install

# Build the functions
npm run build

# Deploy to Azure (using deployment outputs)
func azure functionapp publish <your-function-app-name>
```

#### 4. Deploy Frontend

```bash
# Option 1: Using Azure CLI
az staticwebapp deploy \
  --name <your-static-web-app-name> \
  --resource-group <your-resource-group> \
  --source . \
  --output-location dist

# Option 2: Connect GitHub repository for automatic deployments
# See docs/DEPLOYMENT.md for GitHub integration setup
```

#### 5. Create Initial Admin User

1. Navigate to your deployed Static Web App URL
2. Sign up with the email you specified as `initialAdminEmail`
3. Promote the user to Promaster role:

```sql
-- Connect to your PostgreSQL database
UPDATE user_profiles
SET role = 'promaster'
WHERE email = 'admin@yourcompany.com';
```

## Configuration

### Environment Variables

**Backend (Azure Functions)**:
- `POSTGRESQL_CONNECTION_STRING`: PostgreSQL connection string (auto-configured)
- `KEY_VAULT_URI`: Key Vault URI for secrets (auto-configured)
- `AZURE_AD_TENANT_ID`: Your Azure AD tenant ID (for SSO token validation)
- `AZURE_AD_CLIENT_ID`: Azure AD application client ID
- `JWT_SECRET`: Secure random string for local user token signing (min 32 chars)
- `ALLOWED_ORIGINS`: Comma-separated list of allowed origins

**Frontend (Static Web App)**:
- `VITE_API_URL`: Azure Functions API URL (auto-configured)
- `VITE_AZURE_TENANT_ID`: Your Azure AD tenant ID
- `VITE_AZURE_CLIENT_ID`: Azure AD application client ID
- `VITE_REDIRECT_URI`: Redirect URI for Azure AD authentication

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

3. Create `.env` files with local configuration

4. Start development servers:
   ```bash
   # Frontend (in root directory)
   npm run dev

   # Backend (in backend directory)
   npm start
   ```

### Project Structure

```
cps230-solution/
├── infrastructure/          # Bicep templates for Azure deployment
│   ├── main.bicep          # Main deployment template
│   ├── modules/            # Reusable Bicep modules
│   └── parameters/         # Environment-specific parameters
├── backend/                # Azure Functions backend
│   ├── functions/          # HTTP trigger functions
│   └── shared/             # Shared utilities and middleware
├── database/               # Database schema and migrations
│   ├── schema.sql          # PostgreSQL schema
│   └── init-database.sh    # Initialization script
├── src/                    # React frontend application
├── docs/                   # Documentation
└── .github/workflows/      # CI/CD pipelines
```

## Documentation

### Getting Started
- **[START_HERE.md](START_HERE.md)** - **⭐ Start here!** Complete 30-minute deployment guide
- [CUSTOMER_DEPLOYMENT_CHECKLIST.md](CUSTOMER_DEPLOYMENT_CHECKLIST.md) - Pre/post deployment checklist

### Detailed Guides
- [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) - Detailed deployment instructions
- [docs/QUICK_START_DEPLOYMENT.md](docs/QUICK_START_DEPLOYMENT.md) - Quick deployment for testing
- [.env.example](.env.example) - All environment variables explained

### Development
- [docs/UNIFIED_USER_AUTHENTICATION.md](docs/UNIFIED_USER_AUTHENTICATION.md) - Authentication system details
- Database migrations in `database/migrations/` - Schema change history

## Updating the Application

### Infrastructure Updates

```bash
# Deploy infrastructure changes
az deployment sub create \
  --location australiaeast \
  --template-file infrastructure/main.bicep \
  --parameters @infrastructure/parameters/prod.parameters.json
```

### Application Updates

The application can be updated through:
1. **GitHub Actions**: Automatic deployment on push to main branch
2. **Manual Deployment**: Using Azure CLI commands (see above)

## Monitoring and Troubleshooting

### View Logs

```bash
# Function App logs
az monitor app-insights query \
  --app <your-app-insights-name> \
  --analytics-query "traces | order by timestamp desc | take 100"

# Database metrics
az postgres flexible-server list-statistics \
  --resource-group <your-resource-group> \
  --server-name <your-postgres-server>
```

### Common Issues

See [docs/TROUBLESHOOTING.md](docs/TROUBLESHOOTING.md) for solutions to common deployment and runtime issues.

## Security

- All secrets stored in Azure Key Vault
- HTTPS enforced for all communications
- Row-level security enforced in database
- Dual authentication: Azure AD SSO for organizational users + bcrypt-hashed passwords with JWT tokens for local users
- CORS configured with whitelisted origins

## Cost Optimization

For production workloads, the estimated monthly cost is approximately:
- **Small deployment** (dev/test): $50-100/month
- **Medium deployment** (production): $200-400/month
- **Large deployment** (high availability): $500-800/month

To reduce costs in non-production environments:
- Use Consumption plan for Functions (included in deployment)
- Use Free tier for Static Web Apps (included for non-prod)
- Reduce PostgreSQL server tier
- Disable geo-redundant backup

## Support

For issues and feature requests, please use the GitHub issue tracker.

## License

Copyright © 2024 Nintex. All rights reserved.
