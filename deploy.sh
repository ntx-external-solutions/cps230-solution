#!/bin/bash
# CPS230 Solution - Automated Deployment Script

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

print_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_section() {
    echo -e "\n${BLUE}==== $1 ====${NC}\n"
}

# Check prerequisites
print_section "Checking Prerequisites"

if ! command -v az &> /dev/null; then
    print_error "Azure CLI is not installed. Please install it from: https://docs.microsoft.com/en-us/cli/azure/install-azure-cli"
    exit 1
fi
print_info "Azure CLI found"

# Check if logged in
if ! az account show &> /dev/null; then
    print_error "Not logged in to Azure. Please run 'az login' first."
    exit 1
fi
print_info "Logged in to Azure"

# Get parameters
print_section "Deployment Configuration"

read -p "Environment (dev/staging/prod) [prod]: " ENVIRONMENT
ENVIRONMENT=${ENVIRONMENT:-prod}

read -p "Azure region [australiaeast]: " LOCATION
LOCATION=${LOCATION:-australiaeast}

read -p "Base name for resources [cps230]: " BASE_NAME
BASE_NAME=${BASE_NAME:-cps230}

read -p "Initial admin email: " ADMIN_EMAIL
if [ -z "$ADMIN_EMAIL" ]; then
    print_error "Admin email is required"
    exit 1
fi

read -sp "PostgreSQL admin password: " POSTGRES_PASSWORD
echo
if [ -z "$POSTGRES_PASSWORD" ]; then
    print_error "PostgreSQL password is required"
    exit 1
fi

read -p "GitHub repository URL (optional, press Enter to skip): " GITHUB_REPO

# Confirm deployment
print_section "Deployment Summary"
echo "Environment: $ENVIRONMENT"
echo "Location: $LOCATION"
echo "Base Name: $BASE_NAME"
echo "Admin Email: $ADMIN_EMAIL"
echo "GitHub Repo: ${GITHUB_REPO:-Not specified}"
echo

read -p "Proceed with deployment? (yes/no): " CONFIRM
if [ "$CONFIRM" != "yes" ]; then
    print_warning "Deployment cancelled"
    exit 0
fi

# Deploy infrastructure
print_section "Deploying Azure Infrastructure"

DEPLOYMENT_NAME="cps230-deployment-$(date +%Y%m%d-%H%M%S)"

print_info "Starting deployment: $DEPLOYMENT_NAME"

if [ -n "$GITHUB_REPO" ]; then
    GITHUB_PARAM="githubRepositoryUrl=$GITHUB_REPO"
else
    GITHUB_PARAM=""
fi

az deployment sub create \
    --name "$DEPLOYMENT_NAME" \
    --location "$LOCATION" \
    --template-file infrastructure/main.bicep \
    --parameters \
        environmentName="$ENVIRONMENT" \
        baseName="$BASE_NAME" \
        location="$LOCATION" \
        postgresAdminPassword="$POSTGRES_PASSWORD" \
        initialAdminEmail="$ADMIN_EMAIL" \
        $GITHUB_PARAM \
    --output table

if [ $? -ne 0 ]; then
    print_error "Infrastructure deployment failed"
    exit 1
fi

print_info "Infrastructure deployed successfully"

# Get deployment outputs
print_section "Retrieving Deployment Outputs"

OUTPUTS=$(az deployment sub show \
    --name "$DEPLOYMENT_NAME" \
    --query properties.outputs \
    --output json)

RESOURCE_GROUP=$(echo $OUTPUTS | jq -r '.resourceGroupName.value')
POSTGRES_FQDN=$(echo $OUTPUTS | jq -r '.postgresqlServerFqdn.value')
POSTGRES_DB=$(echo $OUTPUTS | jq -r '.postgresqlDatabaseName.value')
FUNCTION_APP_NAME=$(echo $OUTPUTS | jq -r '.functionAppName.value')
STATIC_WEB_APP_NAME=$(echo $OUTPUTS | jq -r '.staticWebAppName.value')
STATIC_WEB_APP_URL=$(echo $OUTPUTS | jq -r '.staticWebAppUrl.value')
KEY_VAULT_NAME=$(echo $OUTPUTS | jq -r '.keyVaultName.value')

print_info "Resource Group: $RESOURCE_GROUP"
print_info "PostgreSQL Server: $POSTGRES_FQDN"
print_info "Function App: $FUNCTION_APP_NAME"
print_info "Static Web App: $STATIC_WEB_APP_NAME"
print_info "Web App URL: $STATIC_WEB_APP_URL"

# Initialize database
print_section "Initializing Database"

export POSTGRES_HOST="$POSTGRES_FQDN"
export POSTGRES_DB="$POSTGRES_DB"
export POSTGRES_USER="cps230admin"
export POSTGRES_PASSWORD="$POSTGRES_PASSWORD"

print_info "Applying database schema..."

if command -v psql &> /dev/null; then
    ./database/init-database.sh
    if [ $? -eq 0 ]; then
        print_info "Database initialized successfully"
    else
        print_error "Database initialization failed"
        print_warning "You can manually initialize the database later using: ./database/init-database.sh"
    fi
else
    print_warning "psql command not found. Skipping automatic database initialization."
    print_info "Please install PostgreSQL client and run: ./database/init-database.sh"
fi

unset POSTGRES_PASSWORD

# Deploy backend
print_section "Deploying Backend Functions"

print_info "Installing backend dependencies..."
cd backend
npm install

print_info "Building backend..."
npm run build

print_info "Deploying to Azure Functions..."
if command -v func &> /dev/null; then
    func azure functionapp publish "$FUNCTION_APP_NAME" --typescript
    if [ $? -eq 0 ]; then
        print_info "Backend deployed successfully"
    else
        print_error "Backend deployment failed"
    fi
else
    print_warning "Azure Functions Core Tools not found. Skipping automatic backend deployment."
    print_info "Install from: https://docs.microsoft.com/en-us/azure/azure-functions/functions-run-local"
    print_info "Then run: func azure functionapp publish $FUNCTION_APP_NAME"
fi

cd ..

# Save deployment info
print_section "Saving Deployment Information"

cat > deployment-info.txt << EOF
CPS230 Solution Deployment Information
=======================================
Deployment Name: $DEPLOYMENT_NAME
Environment: $ENVIRONMENT
Date: $(date)

Azure Resources:
- Resource Group: $RESOURCE_GROUP
- PostgreSQL Server: $POSTGRES_FQDN
- PostgreSQL Database: $POSTGRES_DB
- Function App: $FUNCTION_APP_NAME
- Static Web App: $STATIC_WEB_APP_NAME
- Key Vault: $KEY_VAULT_NAME

Application URLs:
- Web Application: $STATIC_WEB_APP_URL
- API Endpoint: https://${FUNCTION_APP_NAME}.azurewebsites.net/api

Next Steps:
1. Configure Azure AD B2C (see docs/AZURE_AD_B2C_SETUP.md)
2. Update Function App settings with B2C details
3. Deploy frontend application
4. Access the application at: $STATIC_WEB_APP_URL
5. Sign up with admin email: $ADMIN_EMAIL
6. Promote user to Promaster role in database

For detailed instructions, see README.md
EOF

print_info "Deployment information saved to: deployment-info.txt"

# Summary
print_section "Deployment Complete!"

echo "Your CPS230 solution has been deployed successfully!"
echo
echo "Application URL: $STATIC_WEB_APP_URL"
echo
echo "Next steps:"
echo "1. Configure Azure AD B2C authentication (see docs/AZURE_AD_B2C_SETUP.md)"
echo "2. Update environment variables in Function App"
echo "3. Deploy the frontend application"
echo "4. Create your first admin user"
echo
echo "For detailed instructions, see README.md and deployment-info.txt"
echo

print_info "Deployment script completed"
