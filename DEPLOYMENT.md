# CPS230 Solution - Azure Deployment Guide

This guide will help you deploy the CPS230 Critical Operations Ecosystem solution to Azure with a single click or script.

## Deployment Options

You have three options to deploy the solution:

### Option 1: Deploy to Azure Button (Easiest)

Click the button below to deploy directly from the Azure Portal:

[![Deploy to Azure](https://aka.ms/deploytoazurebutton)](https://portal.azure.com/#create/Microsoft.Template/uri/https%3A%2F%2Fraw.githubusercontent.com%2Fjb-ntx-solutions%2Fcps230-solution%2Fmain%2Finfrastructure%2Fazuredeploy.json)

This will open the Azure Portal with a deployment form. Fill in the required parameters and click "Review + Create".

### Option 2: One-Click Script (Recommended for Developers)

#### For Linux/macOS:

```bash
./deploy-to-azure.sh
```

#### For Windows (PowerShell):

```powershell
.\Deploy-ToAzure.ps1
```

The script will:
1. ✅ Check prerequisites
2. ✅ Prompt for deployment parameters
3. ✅ Deploy all Azure infrastructure
4. ✅ Initialize the database
5. ✅ Build and deploy the backend
6. ✅ Build and deploy the frontend
7. ✅ Configure application settings

**Deployment time:** Approximately 15-20 minutes

### Option 3: Manual Deployment (Advanced)

For advanced users who want full control over the deployment process.

## Prerequisites

Before deploying, ensure you have:

- ✅ **Azure Subscription** with appropriate permissions
- ✅ **Azure CLI** installed ([Download](https://aka.ms/azure-cli))
- ✅ **Node.js 20.x** installed ([Download](https://nodejs.org))
- ✅ **Git** installed (for cloning the repository)
- ✅ **PostgreSQL client** (psql) for database initialization

### Install Prerequisites

#### Windows:
```powershell
# Install Azure CLI
winget install Microsoft.AzureCLI

# Install Node.js
winget install OpenJS.NodeJS.LTS

# Install Git
winget install Git.Git
```

#### macOS:
```bash
# Install Azure CLI
brew install azure-cli

# Install Node.js
brew install node@20

# Install PostgreSQL client
brew install postgresql@16
```

#### Linux (Ubuntu/Debian):
```bash
# Install Azure CLI
curl -sL https://aka.ms/InstallAzureCLIDeb | sudo bash

# Install Node.js
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# Install PostgreSQL client
sudo apt-get install -y postgresql-client
```

## Getting Started

### Step 1: Clone the Repository

```bash
git clone https://github.com/jb-ntx-solutions/cps230-solution.git
cd cps230-solution
```

### Step 2: Login to Azure

```bash
az login
```

Select the appropriate subscription:

```bash
az account set --subscription "Your Subscription Name"
```

### Step 3: Run the Deployment Script

#### Linux/macOS:
```bash
chmod +x deploy-to-azure.sh
./deploy-to-azure.sh
```

#### Windows PowerShell:
```powershell
.\Deploy-ToAzure.ps1
```

### Step 4: Answer the Prompts

The script will ask for:

| Parameter | Description | Example |
|-----------|-------------|---------|
| **Environment** | Deployment environment | `prod`, `staging`, or `dev` |
| **Location** | Azure region | `australiaeast`, `eastus`, `westeurope` |
| **Resource Group** | Name for the resource group | `rg-cps230-prod` |
| **Base Name** | Base name for resources (3-10 chars) | `cps230` |
| **PostgreSQL Password** | Admin password (min 8 chars) | `YourSecurePassword!` |
| **Admin Email** | Initial administrator email | `admin@yourcompany.com` |
| **GitHub Repo** | GitHub repository URL (optional) | Auto-detected |

### Step 5: Wait for Deployment

The script will:
- Deploy Azure infrastructure (10-12 minutes)
- Initialize the database (1-2 minutes)
- Deploy backend functions (2-3 minutes)
- Deploy frontend application (2-3 minutes)
- Configure settings (1 minute)

## What Gets Deployed?

The deployment creates the following Azure resources:

### Core Application
- **Azure Static Web App** - Hosts the frontend React application
- **Azure Functions** - Hosts the backend API
- **PostgreSQL Flexible Server** - Database for all application data

### Security & Secrets
- **Azure Key Vault** - Stores sensitive configuration
- **Managed Identity** - Secure authentication between services

### Monitoring & Logging
- **Application Insights** - Application performance monitoring
- **Log Analytics Workspace** - Centralized logging

### Networking
- **Virtual Network** - Network isolation for database
- **Private Endpoints** - Secure connectivity to Key Vault and PostgreSQL

## After Deployment

Once deployment is complete, you'll see:

```
╔═══════════════════════════════════════════════════════════╗
║                DEPLOYMENT SUCCESSFUL! 🎉                  ║
╚═══════════════════════════════════════════════════════════╝

=== Deployment Information ===
Resource Group:    rg-cps230-prod
Application URL:   https://nice-forest-0541ed000.2.azurestaticapps.net
Database Host:     cps230-palouse-pg.postgres.database.azure.com
Function App:      func-cps230-prod.azurewebsites.net
```

### Next Steps

1. **Access the Application**
   - Navigate to the Application URL
   - Log in with your Azure AD credentials

2. **Configure Process Manager Integration**
   - Go to Settings page
   - Enter your Nintex Process Manager credentials:
     - Site URL (e.g., `demo.promapp.com`)
     - Tenant ID
     - Username
     - Password

3. **Import Processes**
   - Navigate to the Dashboard
   - Click "Sync with Process Manager"
   - Wait for the sync to complete

4. **Set Up Users**
   - Add additional users in the User Management page
   - Assign appropriate roles:
     - **User** - View only access
     - **Business Analyst** - Can modify processes and controls
     - **Promaster** - Full administrative access

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                         End Users                            │
└────────────────────┬────────────────────────────────────────┘
                     │
                     │ HTTPS
                     ▼
┌─────────────────────────────────────────────────────────────┐
│           Azure Static Web App (Frontend)                   │
│                  React + TypeScript                          │
└────────────────────┬────────────────────────────────────────┘
                     │
                     │ API Calls
                     ▼
┌─────────────────────────────────────────────────────────────┐
│           Azure Functions (Backend API)                     │
│                  Node.js 20 + TypeScript                     │
└──┬───────────────┬──────────────────┬───────────────────────┘
   │               │                  │
   │               │                  │
   ▼               ▼                  ▼
┌──────────┐  ┌─────────────┐  ┌──────────────────┐
│PostgreSQL│  │  Key Vault  │  │ App Insights     │
│ Database │  │  (Secrets)  │  │ (Monitoring)     │
└──────────┘  └─────────────┘  └──────────────────┘
```

## Cost Estimate

Estimated monthly Azure costs (USD):

### Production Environment
| Service | SKU | Cost/Month |
|---------|-----|------------|
| Static Web App | Standard | $9 |
| Azure Functions | Elastic Premium EP1 | ~$75 |
| PostgreSQL | D2s_v3 (2 vCPU, 8GB) | ~$120 |
| Key Vault | Standard | $0.03/10k operations |
| Application Insights | Pay-as-you-go | ~$10 |
| **Total** | | **~$214/month** |

### Development/Staging Environment
| Service | SKU | Cost/Month |
|---------|-----|------------|
| Static Web App | Free | $0 |
| Azure Functions | Consumption (Y1) | ~$10 |
| PostgreSQL | B2s (2 vCPU, 1GB) | ~$30 |
| Key Vault | Standard | $0.03/10k operations |
| Application Insights | Pay-as-you-go | ~$5 |
| **Total** | | **~$45/month** |

> **Note:** Costs may vary based on usage, region, and Azure pricing changes.

## Troubleshooting

### Common Issues

#### Issue: "Azure CLI is not installed"
**Solution:** Install Azure CLI from https://aka.ms/azure-cli

#### Issue: "Not logged in to Azure"
**Solution:** Run `az login` and authenticate

#### Issue: "PostgreSQL connection failed"
**Solution:**
- Check firewall rules in Azure Portal
- Ensure your IP is allowed
- Verify SSL mode is set to 'require'

#### Issue: "Function app deployment failed"
**Solution:**
- Check function app logs in Azure Portal
- Verify all environment variables are set
- Ensure managed identity has Key Vault access

#### Issue: "Static Web App not accessible"
**Solution:**
- Wait 2-3 minutes for deployment to propagate
- Check deployment status in Azure Portal
- Verify CORS settings on Function App

### View Logs

```bash
# Application logs
az monitor app-insights query \
  --apps cps230-prod \
  --analytics-query "traces | take 50"

# Function app logs
az functionapp log tail \
  --name func-cps230-prod \
  --resource-group rg-cps230-prod
```

### Database Access

```bash
# Connect to database
psql "host=cps230-palouse-pg.postgres.database.azure.com port=5432 dbname=cps230 user=cps230admin sslmode=require"

# Run migrations
psql "host=cps230-palouse-pg.postgres.database.azure.com port=5432 dbname=cps230 user=cps230admin sslmode=require" -f database/migrations/001_add_process_tags.sql
```

## Security Considerations

### Authentication
- Azure AD B2C integration for user authentication
- Row-level security (RLS) policies on database
- Managed identities for service-to-service authentication

### Data Protection
- All data encrypted at rest (PostgreSQL + Key Vault)
- All data encrypted in transit (TLS 1.2+)
- Private endpoints for database access
- No credentials stored in code or configuration

### Network Security
- Virtual Network integration
- Private endpoints for database
- CORS policies configured
- Firewall rules on PostgreSQL

## Updating the Application

### Backend Updates
```bash
cd backend
npm ci
npm run build
cd ..
zip -r backend.zip backend/*
az functionapp deployment source config-zip \
  --resource-group rg-cps230-prod \
  --name func-cps230-prod \
  --src backend.zip
```

### Frontend Updates
```bash
npm ci
npm run build
npx @azure/static-web-apps-cli deploy \
  --deployment-token <YOUR_API_TOKEN> \
  --app-location "." \
  --output-location "dist"
```

### Database Migrations
```bash
export PGPASSWORD='your-password'
psql "host=your-host.postgres.database.azure.com port=5432 dbname=cps230 user=cps230admin sslmode=require" -f database/migrations/new-migration.sql
```

## Cleanup / Deletion

To remove all deployed resources:

```bash
# Delete entire resource group
az group delete --name rg-cps230-prod --yes --no-wait

# Or run cleanup script
./cleanup-azure.sh
```

⚠️ **Warning:** This will permanently delete all data. Ensure you have backups before proceeding.

## Support & Documentation

- **Technical Documentation:** [docs/README.md](./docs/README.md)
- **API Documentation:** [docs/api/README.md](./docs/api/README.md)
- **User Guide:** [docs/user-guide.md](./docs/user-guide.md)
- **GitHub Issues:** [Report an issue](https://github.com/jb-ntx-solutions/cps230-solution/issues)

## License

Copyright © 2026 Palouse Software. All rights reserved.
