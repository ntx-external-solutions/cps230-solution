#!/bin/bash

###############################################################################
# CPS230 Solution - One-Click Azure Deployment Script
#
# This script deploys the complete CPS230 solution to Azure including:
# - Azure Static Web App (Frontend)
# - Azure Functions (Backend API)
# - PostgreSQL Database
# - Key Vault
# - Application Insights & Monitoring
#
# Prerequisites:
# - Azure CLI installed (az)
# - Logged in to Azure (az login)
# - Node.js 20.x installed
# - Git repository cloned
###############################################################################

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}"
cat << "EOF"
  ______ _____   _____ _____  ____   ___
 / _____|  __ \ / ____|  __ \/__ \ / _ \
| |     | |__) | (___ | |__) | ) || |_| |
| |     |  ___/ \___ \|  ___/ / /  \__  |
| |____ | |     ____) | |    / /_     | |
 \_____ |_|    |_____/|_|   |____|    |_|

Azure Deployment Script
EOF
echo -e "${NC}"

# Check prerequisites
echo -e "${YELLOW}Checking prerequisites...${NC}"

if ! command -v az &> /dev/null; then
    echo -e "${RED}ERROR: Azure CLI is not installed. Please install from https://aka.ms/azure-cli${NC}"
    exit 1
fi

if ! command -v node &> /dev/null; then
    echo -e "${RED}ERROR: Node.js is not installed. Please install version 20.x from https://nodejs.org${NC}"
    exit 1
fi

# Check if logged in to Azure
if ! az account show &> /dev/null; then
    echo -e "${RED}ERROR: Not logged in to Azure. Please run 'az login' first.${NC}"
    exit 1
fi

echo -e "${GREEN}✓ Prerequisites check passed${NC}\n"

# Get deployment parameters from user
echo -e "${BLUE}=== Deployment Configuration ===${NC}"
read -p "Environment name (dev/staging/prod) [default: prod]: " ENVIRONMENT
ENVIRONMENT=${ENVIRONMENT:-prod}

read -p "Azure location [default: australiaeast]: " LOCATION
LOCATION=${LOCATION:-australiaeast}

read -p "Resource group name [default: rg-cps230-${ENVIRONMENT}]: " RESOURCE_GROUP
RESOURCE_GROUP=${RESOURCE_GROUP:-rg-cps230-${ENVIRONMENT}}

read -p "Base name for resources [default: cps230]: " BASE_NAME
BASE_NAME=${BASE_NAME:-cps230}

read -sp "PostgreSQL admin password (min 8 chars): " POSTGRES_PASSWORD
echo
if [ ${#POSTGRES_PASSWORD} -lt 8 ]; then
    echo -e "${RED}ERROR: Password must be at least 8 characters${NC}"
    exit 1
fi

read -p "Initial admin email address: " ADMIN_EMAIL
if [ -z "$ADMIN_EMAIL" ]; then
    echo -e "${RED}ERROR: Admin email is required${NC}"
    exit 1
fi

# Get GitHub repository URL (optional)
GITHUB_REPO=$(git config --get remote.origin.url 2>/dev/null || echo "")
read -p "GitHub repository URL [default: ${GITHUB_REPO}]: " GITHUB_REPO_INPUT
GITHUB_REPO=${GITHUB_REPO_INPUT:-$GITHUB_REPO}

echo -e "\n${YELLOW}=== Deployment Summary ===${NC}"
echo "Environment: $ENVIRONMENT"
echo "Location: $LOCATION"
echo "Resource Group: $RESOURCE_GROUP"
echo "Base Name: $BASE_NAME"
echo "Admin Email: $ADMIN_EMAIL"
echo "GitHub Repo: $GITHUB_REPO"
echo

read -p "Proceed with deployment? (yes/no): " CONFIRM
if [ "$CONFIRM" != "yes" ] && [ "$CONFIRM" != "y" ]; then
    echo "Deployment cancelled."
    exit 0
fi

# Start deployment
echo -e "\n${BLUE}=== Starting Deployment ===${NC}"

# Step 1: Deploy Infrastructure
echo -e "\n${YELLOW}Step 1/5: Deploying Azure Infrastructure...${NC}"
DEPLOYMENT_NAME="cps230-$(date +%Y%m%d-%H%M%S)"

DEPLOYMENT_OUTPUT=$(az deployment sub create \
    --location "$LOCATION" \
    --template-file infrastructure/main.bicep \
    --parameters \
        environmentName="$ENVIRONMENT" \
        location="$LOCATION" \
        baseName="$BASE_NAME" \
        resourceGroupName="$RESOURCE_GROUP" \
        postgresAdminPassword="$POSTGRES_PASSWORD" \
        initialAdminEmail="$ADMIN_EMAIL" \
        githubRepositoryUrl="$GITHUB_REPO" \
    --name "$DEPLOYMENT_NAME" \
    --output json)

if [ $? -ne 0 ]; then
    echo -e "${RED}ERROR: Infrastructure deployment failed${NC}"
    exit 1
fi

echo -e "${GREEN}✓ Infrastructure deployed successfully${NC}"

# Extract outputs
POSTGRES_HOST=$(echo "$DEPLOYMENT_OUTPUT" | jq -r '.properties.outputs.postgresqlServerFqdn.value')
POSTGRES_DB=$(echo "$DEPLOYMENT_OUTPUT" | jq -r '.properties.outputs.postgresqlDatabaseName.value')
FUNCTION_APP_NAME=$(echo "$DEPLOYMENT_OUTPUT" | jq -r '.properties.outputs.functionAppName.value')
STATIC_WEB_APP_NAME=$(echo "$DEPLOYMENT_OUTPUT" | jq -r '.properties.outputs.staticWebAppName.value')
STATIC_WEB_APP_URL=$(echo "$DEPLOYMENT_OUTPUT" | jq -r '.properties.outputs.staticWebAppUrl.value')
STATIC_WEB_APP_API_KEY=$(echo "$DEPLOYMENT_OUTPUT" | jq -r '.properties.outputs.staticWebAppApiKey.value')

# Step 2: Initialize Database
echo -e "\n${YELLOW}Step 2/5: Initializing Database Schema...${NC}"

# Wait for PostgreSQL to be ready
echo "Waiting for PostgreSQL to be ready..."
sleep 30

# Add current IP to firewall
CURRENT_IP=$(curl -s https://api.ipify.org)
echo "Adding IP $CURRENT_IP to PostgreSQL firewall..."
az postgres flexible-server firewall-rule create \
    --resource-group "$RESOURCE_GROUP" \
    --name "${BASE_NAME}-${ENVIRONMENT}" \
    --rule-name "DeploymentScript" \
    --start-ip-address "$CURRENT_IP" \
    --end-ip-address "$CURRENT_IP" \
    > /dev/null

# Run database migrations
echo "Running database schema initialization..."
export PGPASSWORD="$POSTGRES_PASSWORD"
psql "host=${POSTGRES_HOST} port=5432 dbname=${POSTGRES_DB} user=cps230admin sslmode=require" \
    -f database/schema.sql

# Run migrations
for migration in database/migrations/*.sql; do
    if [ -f "$migration" ]; then
        echo "Running migration: $(basename $migration)"
        psql "host=${POSTGRES_HOST} port=5432 dbname=${POSTGRES_DB} user=cps230admin sslmode=require" \
            -f "$migration"
    fi
done

echo -e "${GREEN}✓ Database initialized successfully${NC}"

# Step 3: Build and Deploy Backend
echo -e "\n${YELLOW}Step 3/5: Building and Deploying Backend Functions...${NC}"

cd backend
npm ci
npm run build
cd ..

az functionapp deployment source config-zip \
    --resource-group "$RESOURCE_GROUP" \
    --name "$FUNCTION_APP_NAME" \
    --src backend.zip \
    > /dev/null 2>&1 || (cd backend && zip -r ../backend.zip . > /dev/null && cd .. && \
    az functionapp deployment source config-zip \
        --resource-group "$RESOURCE_GROUP" \
        --name "$FUNCTION_APP_NAME" \
        --src backend.zip > /dev/null)

echo -e "${GREEN}✓ Backend deployed successfully${NC}"

# Step 4: Build and Deploy Frontend
echo -e "\n${YELLOW}Step 4/5: Building and Deploying Frontend...${NC}"

npm ci
npm run build

# Deploy to Static Web App using the API key
npx @azure/static-web-apps-cli deploy \
    --deployment-token "$STATIC_WEB_APP_API_KEY" \
    --app-location "." \
    --output-location "dist" \
    --no-use-keychain \
    > /dev/null 2>&1 || \
az staticwebapp environment create \
    --resource-group "$RESOURCE_GROUP" \
    --name "$STATIC_WEB_APP_NAME" \
    --environment-name "default" \
    --source "./dist"

echo -e "${GREEN}✓ Frontend deployed successfully${NC}"

# Step 5: Post-deployment Configuration
echo -e "\n${YELLOW}Step 5/5: Configuring Application Settings...${NC}"

# Configure CORS for Function App
az functionapp cors add \
    --resource-group "$RESOURCE_GROUP" \
    --name "$FUNCTION_APP_NAME" \
    --allowed-origins "$STATIC_WEB_APP_URL" \
    > /dev/null

echo -e "${GREEN}✓ Configuration completed${NC}"

# Deployment Complete
echo -e "\n${GREEN}╔═══════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║                DEPLOYMENT SUCCESSFUL! 🎉                  ║${NC}"
echo -e "${GREEN}╚═══════════════════════════════════════════════════════════╝${NC}\n"

echo -e "${BLUE}=== Deployment Information ===${NC}"
echo -e "Resource Group:    ${GREEN}$RESOURCE_GROUP${NC}"
echo -e "Application URL:   ${GREEN}$STATIC_WEB_APP_URL${NC}"
echo -e "Database Host:     ${GREEN}$POSTGRES_HOST${NC}"
echo -e "Function App:      ${GREEN}${FUNCTION_APP_NAME}.azurewebsites.net${NC}"
echo

echo -e "${YELLOW}=== Next Steps ===${NC}"
echo "1. Navigate to: $STATIC_WEB_APP_URL"
echo "2. Log in with Azure AD credentials"
echo "3. Configure Process Manager credentials in Settings"
echo "4. Run initial sync to import processes"
echo

echo -e "${BLUE}=== Useful Commands ===${NC}"
echo "View logs:         az monitor app-insights query --apps $BASE_NAME-$ENVIRONMENT --analytics-query 'traces'"
echo "Update functions:  az functionapp deployment source config-zip -g $RESOURCE_GROUP -n $FUNCTION_APP_NAME --src backend.zip"
echo "Database console:  psql \"host=${POSTGRES_HOST} port=5432 dbname=${POSTGRES_DB} user=cps230admin sslmode=require\""
echo

echo -e "${GREEN}Deployment completed at $(date)${NC}"
