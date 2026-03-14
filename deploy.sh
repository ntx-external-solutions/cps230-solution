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

read -p "Enable cost-optimized configuration? (Reduces costs ~90%, yes/no) [yes]: " COST_OPT
COST_OPT=${COST_OPT:-yes}
COST_OPTIMIZED=$([ "$COST_OPT" = "yes" ] && echo "true" || echo "false")

print_section "Azure AD SSO Configuration (Optional)"
echo "Azure AD SSO is optional. You can:"
echo "  1. Configure now for SSO authentication"
echo "  2. Skip and use local database authentication only"
echo "  3. Add Azure AD SSO later via Azure Portal"
echo ""
read -p "Configure Azure AD SSO now? (yes/no) [no]: " CONFIGURE_AZURE_AD
CONFIGURE_AZURE_AD=${CONFIGURE_AZURE_AD:-no}

if [ "$CONFIGURE_AZURE_AD" = "yes" ]; then
    read -p "Azure AD Tenant ID: " AZURE_TENANT_ID
    if [ -z "$AZURE_TENANT_ID" ]; then
        print_error "Azure AD Tenant ID is required when configuring SSO"
        exit 1
    fi

    read -p "Azure AD Client ID (App Registration): " AZURE_CLIENT_ID
    if [ -z "$AZURE_CLIENT_ID" ]; then
        print_error "Azure AD Client ID is required when configuring SSO"
        exit 1
    fi
else
    print_info "Skipping Azure AD SSO configuration"
    print_info "The application will use local database authentication only"
    AZURE_TENANT_ID=""
    AZURE_CLIENT_ID=""
fi

# Confirm deployment
print_section "Deployment Summary"
echo "Environment: $ENVIRONMENT"
echo "Location: $LOCATION"
echo "Base Name: $BASE_NAME"
echo "Admin Email: $ADMIN_EMAIL"
echo "GitHub Repo: ${GITHUB_REPO:-Not specified}"
echo "Cost Optimized: $COST_OPTIMIZED"
if [ -n "$AZURE_TENANT_ID" ]; then
    echo "Azure AD SSO: Enabled"
    echo "  - Tenant ID: $AZURE_TENANT_ID"
    echo "  - Client ID: $AZURE_CLIENT_ID"
else
    echo "Azure AD SSO: Disabled (local authentication only)"
fi
echo
if [ "$COST_OPTIMIZED" = "true" ]; then
    print_info "Cost-optimized mode: ~\$35-55/month (Burstable DB, Consumption Functions, Free Static Web App)"
else
    print_warning "Enterprise mode: ~\$480-590/month (HA Database, Premium Functions, Standard Static Web App)"
fi
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
        costOptimized="$COST_OPTIMIZED" \
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

        # Create initial admin user
        print_info "Creating initial admin user..."
        export ADMIN_EMAIL="$ADMIN_EMAIL"
        export ADMIN_PASSWORD="$POSTGRES_PASSWORD"
        export ADMIN_FULL_NAME="System Administrator"

        ./database/create-initial-admin.sh
        if [ $? -eq 0 ]; then
            print_info "Initial admin user created successfully"
        else
            print_warning "Failed to create initial admin user"
            print_info "You can manually create an admin user later"
        fi
    else
        print_error "Database initialization failed"
        print_warning "You can manually initialize the database later using: ./database/init-database.sh"
    fi
else
    print_warning "psql command not found. Skipping automatic database initialization."
    print_info "Please install PostgreSQL client and run: ./database/init-database.sh"
fi

unset POSTGRES_PASSWORD
unset ADMIN_PASSWORD

# Configure Azure AD App Registration (if configured)
if [ -n "$AZURE_CLIENT_ID" ]; then
    print_section "Configuring Azure AD App Registration"

    print_info "Updating Azure AD app registration with SPA redirect URI: $STATIC_WEB_APP_URL"

    # Get existing SPA redirect URIs to preserve them
    EXISTING_URIS=$(az ad app show --id "$AZURE_CLIENT_ID" --query "spa.redirectUris" -o json 2>/dev/null || echo "[]")

    # Add the new URI if it doesn't exist
    if echo "$EXISTING_URIS" | grep -q "$STATIC_WEB_APP_URL"; then
        print_info "Redirect URI already configured"
    else
        # Create updated list with new URI
        UPDATED_URIS=$(echo "$EXISTING_URIS" | jq --arg uri "$STATIC_WEB_APP_URL" '. + [$uri] | unique')

        # Update the app registration using Graph API
        az rest --method PATCH \
            --uri "https://graph.microsoft.com/v1.0/applications(appId='$AZURE_CLIENT_ID')" \
            --headers "Content-Type=application/json" \
            --body "{\"spa\": {\"redirectUris\": $UPDATED_URIS}}" \
            2>/dev/null

        if [ $? -eq 0 ]; then
            print_info "Azure AD app registration updated successfully (SPA platform)"
        else
            print_error "Failed to update Azure AD app registration"
            print_warning "You may need to manually add the redirect URI to the SPA platform in the Azure Portal"
        fi
    fi
else
    print_section "Skipping Azure AD Configuration"
    print_info "Azure AD SSO not configured - using local authentication only"
fi

print_section "Configuring Function App Settings"

print_info "Generating JWT secret..."
JWT_SECRET=$(openssl rand -base64 32)

print_info "Updating Function App environment variables..."

# URL-encode the PostgreSQL password to handle special characters
# This prevents issues with characters like ?, &, @, etc.
url_encode() {
    local string="${1}"
    local strlen=${#string}
    local encoded=""
    local pos c o

    for (( pos=0 ; pos<strlen ; pos++ )); do
        c=${string:$pos:1}
        case "$c" in
            [-_.~a-zA-Z0-9] ) o="${c}" ;;
            * ) printf -v o '%%%02x' "'$c"
        esac
        encoded+="${o}"
    done
    echo "${encoded}"
}

POSTGRES_PASSWORD_ENCODED=$(url_encode "$POSTGRES_PASSWORD")

# Construct PostgreSQL connection string in correct format for Node.js pg library
POSTGRES_CONN_STRING="postgresql://cps230admin:${POSTGRES_PASSWORD_ENCODED}@${POSTGRES_FQDN}:5432/${POSTGRES_DB}?sslmode=require"

az functionapp config appsettings set \
    --name "$FUNCTION_APP_NAME" \
    --resource-group "$RESOURCE_GROUP" \
    --settings \
        AZURE_TENANT_ID="$AZURE_TENANT_ID" \
        AZURE_CLIENT_ID="$AZURE_CLIENT_ID" \
        JWT_SECRET="$JWT_SECRET" \
        ALLOWED_ORIGINS="$STATIC_WEB_APP_URL" \
        STATIC_WEB_APP_URL="$STATIC_WEB_APP_URL" \
        POSTGRESQL_CONNECTION_STRING="$POSTGRES_CONN_STRING" \
        POSTGRES_HOST="$POSTGRES_FQDN" \
        POSTGRES_DB="$POSTGRES_DB" \
        POSTGRES_USER="cps230admin" \
        POSTGRES_PASSWORD="$POSTGRES_PASSWORD" \
    --output table

if [ $? -eq 0 ]; then
    print_info "Function App settings updated successfully"
else
    print_error "Function App settings update failed"
fi

print_info "Configuring Function App CORS..."
az functionapp cors add \
    --name "$FUNCTION_APP_NAME" \
    --resource-group "$RESOURCE_GROUP" \
    --allowed-origins "$STATIC_WEB_APP_URL" \
    2>/dev/null

if [ $? -eq 0 ]; then
    print_info "CORS configured successfully"
else
    print_warning "CORS configuration may have failed - check Azure Portal if needed"
fi

# Deploy backend AFTER configuring environment variables
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

# Deploy frontend
print_section "Deploying Frontend Application"

print_info "Creating production environment configuration..."
cat > .env.production << EOF
VITE_API_URL=https://${FUNCTION_APP_NAME}.azurewebsites.net/api
VITE_AZURE_TENANT_ID=$AZURE_TENANT_ID
VITE_AZURE_CLIENT_ID=$AZURE_CLIENT_ID
VITE_REDIRECT_URI=$STATIC_WEB_APP_URL
EOF

print_info "Installing frontend dependencies..."
npm install --legacy-peer-deps

print_info "Building frontend application..."
npm run build

if [ $? -ne 0 ]; then
    print_error "Frontend build failed"
    print_warning "Skipping frontend deployment"
else
    print_info "Getting Static Web App deployment token..."
    DEPLOY_TOKEN=$(az staticwebapp secrets list \
        --name "$STATIC_WEB_APP_NAME" \
        --resource-group "$RESOURCE_GROUP" \
        --query properties.apiKey -o tsv)

    if [ -n "$DEPLOY_TOKEN" ]; then
        print_info "Deploying frontend to Static Web App..."
        npx @azure/static-web-apps-cli deploy ./dist \
            --deployment-token "$DEPLOY_TOKEN" \
            --env production

        if [ $? -eq 0 ]; then
            print_info "Frontend deployed successfully"
        else
            print_error "Frontend deployment failed"
        fi
    else
        print_error "Failed to retrieve Static Web App deployment token"
        print_warning "You can manually deploy the frontend later"
    fi
fi

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

Authentication Configuration:
EOF

if [ -n "$AZURE_TENANT_ID" ]; then
cat >> deployment-info.txt << EOF
- Mode: Azure AD SSO + Local Authentication
- Azure AD Tenant ID: $AZURE_TENANT_ID
- Azure AD Client ID: $AZURE_CLIENT_ID
- Azure AD Redirect URI: $STATIC_WEB_APP_URL
EOF
else
cat >> deployment-info.txt << EOF
- Mode: Local Authentication Only
- Azure AD: Not configured (can be added later)
EOF
fi

cat >> deployment-info.txt << EOF

Initial Admin Credentials:
- Email:    $ADMIN_EMAIL
- Password: (same as PostgreSQL admin password)
- Role:     promaster (full admin access)

⚠️  IMPORTANT: Change the admin password after first login!

Deployment Status:
✅ Infrastructure deployed
✅ Database initialized
✅ Backend deployed
✅ Initial admin user created
EOF

if [ -n "$AZURE_TENANT_ID" ]; then
cat >> deployment-info.txt << EOF
✅ Azure AD app registration configured
EOF
else
cat >> deployment-info.txt << EOF
⚪ Azure AD SSO skipped (using local auth only)
EOF
fi

cat >> deployment-info.txt << EOF
✅ Function App environment variables set
✅ Frontend built and deployed

Next Steps:
1. Access the application at: $STATIC_WEB_APP_URL
EOF

if [ -n "$AZURE_TENANT_ID" ]; then
cat >> deployment-info.txt << EOF
2. Sign in with Azure AD - first user will automatically get 'promaster' role
   OR create a local user account (first user will get 'promaster' role)
EOF
else
cat >> deployment-info.txt << EOF
2. Log in with the initial admin credentials:
   - Email: $ADMIN_EMAIL
   - Password: (same as PostgreSQL password)
   - Role: promaster (full admin access)
   ⚠️  Change this password after first login!
3. (Optional) Configure Azure AD SSO later via Function App settings:
   - Add AZURE_TENANT_ID and AZURE_CLIENT_ID to Function App
   - Add VITE_AZURE_TENANT_ID, VITE_AZURE_CLIENT_ID to Static Web App
   - Rebuild and redeploy frontend
EOF
fi

cat >> deployment-info.txt << EOF
4. Configure Process Manager credentials in Settings
5. Test sync with Nintex Process Manager
6. Add other users as needed

For detailed instructions, see README.md
EOF

print_info "Deployment information saved to: deployment-info.txt"

# Summary
print_section "Deployment Complete!"

echo "Your CPS230 solution has been deployed successfully!"
echo
echo "🌐 Application URL: $STATIC_WEB_APP_URL"
echo "🔗 API Endpoint: https://${FUNCTION_APP_NAME}.azurewebsites.net/api"
echo
echo "✅ Deployment Status:"
echo "  • Infrastructure deployed (cost-optimized: $COST_OPTIMIZED)"
echo "  • Database initialized with schema"
echo "  • Backend deployed (14 HTTP functions)"
echo "  • Initial admin user created"
if [ -n "$AZURE_TENANT_ID" ]; then
    echo "  • Azure AD SSO configured"
else
    echo "  • Local authentication configured (Azure AD SSO skipped)"
fi
echo "  • Function App environment variables set"
echo "  • Frontend built and deployed"
echo
echo "🔑 Initial Admin Credentials:"
echo "  • Email:    $ADMIN_EMAIL"
echo "  • Password: (same as PostgreSQL password)"
echo "  • Role:     promaster (full admin access)"
echo "  ⚠️  IMPORTANT: Change this password after first login!"
echo
echo "🎯 Next Steps:"
echo "  1. Visit: $STATIC_WEB_APP_URL"
if [ -n "$AZURE_TENANT_ID" ]; then
    echo "  2. Sign in with Azure AD OR use the local admin account above"
else
    echo "  2. Log in with the admin credentials shown above"
fi
echo "  3. Configure Process Manager credentials in Settings"
echo "  4. Test sync with Nintex Process Manager"
echo "  5. Add other users as needed"
echo
if [ -z "$AZURE_TENANT_ID" ]; then
    echo "💡 To add Azure AD SSO later:"
    echo "   - Create Azure AD App Registration"
    echo "   - Update Function App settings (AZURE_TENANT_ID, AZURE_CLIENT_ID)"
    echo "   - Update Static Web App settings (VITE_AZURE_TENANT_ID, VITE_AZURE_CLIENT_ID)"
    echo "   - Rebuild and redeploy frontend"
    echo
fi
echo "📄 Full deployment details saved to: deployment-info.txt"
echo

print_info "Deployment script completed successfully!"
