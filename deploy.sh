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

read -p "GitHub repository URL (optional, press Enter to skip): " GITHUB_REPO

read -p "Enable cost-optimized configuration? (Reduces costs ~90%, yes/no) [yes]: " COST_OPT
COST_OPT=${COST_OPT:-yes}
COST_OPTIMIZED=$([ "$COST_OPT" = "yes" ] && echo "true" || echo "false")

print_section "Initial Admin Account"
echo "This is the first application login (local username/password). It is kept"
echo "separate from the PostgreSQL database password below."
echo ""
read -p "Admin username (email address): " ADMIN_EMAIL
if [ -z "$ADMIN_EMAIL" ]; then
    print_error "Admin email is required"
    exit 1
fi

read -p "Admin full name [System Administrator]: " ADMIN_FULL_NAME
ADMIN_FULL_NAME=${ADMIN_FULL_NAME:-System Administrator}

# Dedicated admin password (prompted + confirmed), NOT reused from PostgreSQL.
while true; do
    read -sp "Admin password (min 8 chars): " ADMIN_PASSWORD
    echo
    if [ ${#ADMIN_PASSWORD} -lt 8 ]; then
        print_error "Admin password must be at least 8 characters"
        continue
    fi
    read -sp "Confirm admin password: " ADMIN_PASSWORD_CONFIRM
    echo
    if [ "$ADMIN_PASSWORD" != "$ADMIN_PASSWORD_CONFIRM" ]; then
        print_error "Passwords do not match; please try again"
        continue
    fi
    break
done

print_section "Database Configuration"
read -sp "PostgreSQL admin password: " POSTGRES_PASSWORD
echo
if [ -z "$POSTGRES_PASSWORD" ]; then
    print_error "PostgreSQL password is required"
    exit 1
fi

print_section "Single Sign-On (SSO) Configuration (Optional)"
echo "This app can authenticate users who live in a SEPARATE Azure AD (Entra ID)"
echo "tenant from the one hosting the app. Two directories are involved:"
echo ""
echo "  • HOST tenant  – the Azure subscription you are deploying into right now."
echo "                   The App Registration for this app lives here. You are"
echo "                   currently signed in to this tenant with 'az login'."
echo "  • SSO tenant   – your users' Azure AD / Entra directory. People sign in"
echo "                   from here. An Enterprise App is created in this tenant"
echo "                   when one of ITS admins grants consent — a step this"
echo "                   script prints for you at the end."
echo ""
echo "Before continuing you need an App Registration in the HOST tenant that is"
echo "marked multi-tenant (\"Accounts in any organizational directory\"). This"
echo "script will set that flag for you if it isn't already. Create the App"
echo "Registration in the Azure Portal (Azure AD > App registrations > New) if you"
echo "don't have one yet, and note its Application (client) ID."
echo ""
echo "You can:"
echo "  1. Configure external-tenant SSO now"
echo "  2. Skip and use local database authentication only (add SSO later)"
echo ""
read -p "Configure external-tenant SSO now? (yes/no) [no]: " CONFIGURE_AZURE_AD
CONFIGURE_AZURE_AD=${CONFIGURE_AZURE_AD:-no}

if [ "$CONFIGURE_AZURE_AD" = "yes" ]; then
    echo ""
    echo "Enter the App Registration from the HOST tenant (where the app is deployed):"
    read -p "  Host App Registration - Application (client) ID: " AZURE_CLIENT_ID
    if [ -z "$AZURE_CLIENT_ID" ]; then
        print_error "Host App Registration Client ID is required when configuring SSO"
        exit 1
    fi

    echo ""
    echo "Enter the SSO tenant (your users' Azure AD / Entra directory):"
    read -p "  SSO (users') Directory (tenant) ID: " AZURE_TENANT_ID
    if [ -z "$AZURE_TENANT_ID" ]; then
        print_error "SSO tenant ID is required when configuring SSO"
        exit 1
    fi

    echo ""
    echo "Which SSO user(s) should become an admin (promaster) on first login?"
    echo "Enter one or more email addresses, comma-separated. Everyone else who"
    echo "signs in starts as a normal 'user'. Leave blank to assign roles later"
    echo "using the seeded local admin account."
    read -p "  Initial promaster email(s): " INITIAL_PROMASTER_EMAILS
else
    print_info "Skipping SSO configuration"
    print_info "The application will use local database authentication only"
    AZURE_TENANT_ID=""
    AZURE_CLIENT_ID=""
    INITIAL_PROMASTER_EMAILS=""
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
    echo "External-tenant SSO: Enabled"
    echo "  - SSO (users') tenant ID: $AZURE_TENANT_ID"
    echo "  - Host App Registration client ID: $AZURE_CLIENT_ID"
    echo "  - Initial promaster email(s): ${INITIAL_PROMASTER_EMAILS:-none (assign via local admin)}"
else
    echo "SSO: Disabled (local authentication only)"
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

# Allow this machine to reach PostgreSQL for schema init.
# The Bicep only opens the server to Azure services (0.0.0.0); the schema and
# initial-admin scripts below run psql from THIS machine, so without a firewall
# rule for the current public IP they fail with "Failed to connect".
print_section "Configuring Database Firewall"
POSTGRES_SERVER_NAME="${POSTGRES_FQDN%%.*}"
CURRENT_IP=$(curl -s https://api.ipify.org)
if [ -n "$CURRENT_IP" ]; then
    print_info "Adding deployment machine IP ($CURRENT_IP) to PostgreSQL firewall..."
    az postgres flexible-server firewall-rule create \
        --resource-group "$RESOURCE_GROUP" \
        --name "$POSTGRES_SERVER_NAME" \
        --rule-name "deploy-machine" \
        --start-ip-address "$CURRENT_IP" \
        --end-ip-address "$CURRENT_IP" \
        --output none 2>/dev/null \
        && print_info "Firewall rule added" \
        || print_warning "Could not add firewall rule; database init may fail to connect"
else
    print_warning "Could not determine public IP; database init may fail to connect"
fi

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

        # Create initial admin user.
        # create-initial-admin.sh hashes the password with the backend's bcryptjs,
        # so backend dependencies must be installed BEFORE this runs (the main
        # backend `npm install` happens later in the script).
        if [ ! -d backend/node_modules/bcryptjs ]; then
            print_info "Installing backend dependencies (required for admin creation)..."
            (cd backend && npm install)
        fi

        print_info "Creating initial admin user..."
        export ADMIN_EMAIL="$ADMIN_EMAIL"
        export ADMIN_PASSWORD="$ADMIN_PASSWORD"
        export ADMIN_FULL_NAME="$ADMIN_FULL_NAME"

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
unset ADMIN_PASSWORD_CONFIRM

# Configure Azure AD App Registration (if configured).
# NOTE: the App Registration lives in the HOST tenant (the one you're logged into
# with `az login`), NOT the SSO/users tenant. All az commands below target the
# host tenant's app registration.
if [ -n "$AZURE_CLIENT_ID" ]; then
    print_section "Configuring Host Tenant App Registration"

    # Ensure the app registration is multi-tenant. Without this, users from the
    # separate SSO tenant cannot sign in (Azure returns AADSTS50020 / AADSTS700016).
    print_info "Ensuring App Registration accepts users from other tenants (multi-tenant)..."
    CURRENT_AUDIENCE=$(az ad app show --id "$AZURE_CLIENT_ID" --query "signInAudience" -o tsv 2>/dev/null || echo "")
    if [ "$CURRENT_AUDIENCE" = "AzureADMultipleOrgs" ] || [ "$CURRENT_AUDIENCE" = "AzureADandPersonalMicrosoftAccount" ]; then
        print_info "App Registration is already multi-tenant ($CURRENT_AUDIENCE)"
    else
        az rest --method PATCH \
            --uri "https://graph.microsoft.com/v1.0/applications(appId='$AZURE_CLIENT_ID')" \
            --headers "Content-Type=application/json" \
            --body "{\"signInAudience\": \"AzureADMultipleOrgs\"}" \
            2>/dev/null \
            && print_info "App Registration set to multi-tenant (AzureADMultipleOrgs)" \
            || print_warning "Could not set multi-tenant flag; set 'Supported account types' to 'Accounts in any organizational directory' manually in the Azure Portal"
    fi

    print_info "Updating App Registration with SPA redirect URI: $STATIC_WEB_APP_URL"

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
        INITIAL_PROMASTER_EMAILS="$INITIAL_PROMASTER_EMAILS" \
        ENABLE_AAD_USER_MANAGEMENT="false" \
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

# Strip dev dependencies before publishing so we don't upload the entire dev
# toolchain (jest, ts-jest, etc.). This keeps the deployment package small
# (~10-15 MB) and avoids slow/failed uploads over constrained connections.
print_info "Pruning to production dependencies for a lean deployment package..."
npm prune --production

print_info "Packaging backend..."
# Package the built app (host.json + package.json + dist + production node_modules)
# with host.json at the zip root, as the Functions host expects.
rm -f ../backend.zip
zip -r -q ../backend.zip host.json package.json dist node_modules -x "*.ts" -x "*.js.map"

cd ..

# Deploy the backend by uploading the package to the Function App's storage
# account and pointing the app at it via WEBSITE_RUN_FROM_PACKAGE.
#
# We deliberately DON'T use `func azure functionapp publish` or
# `az functionapp deployment source config-zip`: both push straight to the
# Kudu/SCM endpoint, which frequently times out on slower uplinks ("write
# operation timed out" / stalled uploads). Uploading to blob storage is chunked
# and retryable, and this method needs no Azure Functions Core Tools installed.
print_info "Deploying backend via storage package (WEBSITE_RUN_FROM_PACKAGE)..."
STORAGE_ACCOUNT=$(az storage account list --resource-group "$RESOURCE_GROUP" --query "[0].name" -o tsv)
if [ -z "$STORAGE_ACCOUNT" ]; then
    print_error "Could not find the Function App storage account; skipping backend deployment"
    print_warning "You can deploy manually later with: func azure functionapp publish $FUNCTION_APP_NAME --typescript"
else
    STORAGE_KEY=$(az storage account keys list --account-name "$STORAGE_ACCOUNT" --resource-group "$RESOURCE_GROUP" --query "[0].value" -o tsv)
    az storage container create --name deployments --account-name "$STORAGE_ACCOUNT" --account-key "$STORAGE_KEY" --output none

    print_info "Uploading backend package to blob storage..."
    az storage blob upload --account-name "$STORAGE_ACCOUNT" --account-key "$STORAGE_KEY" \
        --container-name deployments --name backend.zip --file backend.zip \
        --overwrite --max-connections 4 --output none

    # Long-lived read SAS (run-from-package needs ongoing access to the blob).
    SAS_EXPIRY=$(date -u -v+1095d '+%Y-%m-%dT%H:%MZ' 2>/dev/null || date -u -d '+1095 days' '+%Y-%m-%dT%H:%MZ')
    SAS_TOKEN=$(az storage blob generate-sas --account-name "$STORAGE_ACCOUNT" --account-key "$STORAGE_KEY" \
        --container-name deployments --name backend.zip --permissions r --expiry "$SAS_EXPIRY" --https-only -o tsv)
    PACKAGE_URL="https://$STORAGE_ACCOUNT.blob.core.windows.net/deployments/backend.zip?$SAS_TOKEN"

    az functionapp config appsettings set --name "$FUNCTION_APP_NAME" --resource-group "$RESOURCE_GROUP" \
        --settings WEBSITE_RUN_FROM_PACKAGE="$PACKAGE_URL" --output none

    print_info "Restarting Function App to mount the package..."
    az functionapp restart --name "$FUNCTION_APP_NAME" --resource-group "$RESOURCE_GROUP" --output none
    rm -f backend.zip
    print_info "Backend deployed (functions become live ~1-2 minutes after the restart)"
fi

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

# Build the SSO tenant admin-consent URL (used below and saved to deployment info).
# Granting consent in the SSO tenant is what creates the Enterprise App (service
# principal) there and lets that tenant's users sign in.
if [ -n "$AZURE_TENANT_ID" ]; then
    ADMIN_CONSENT_URL="https://login.microsoftonline.com/${AZURE_TENANT_ID}/adminconsent?client_id=${AZURE_CLIENT_ID}&redirect_uri=${STATIC_WEB_APP_URL}"

    print_section "ACTION REQUIRED — In Your SSO (Users') Tenant"
    print_warning "Everything above ran in the HOST tenant. One step remains, and it must"
    print_warning "be done by a Global Administrator (or Privileged Role Admin) of the SSO"
    print_warning "tenant ($AZURE_TENANT_ID) — the directory your users belong to."
    echo ""
    echo "That admin must open this consent URL once and approve the app. This creates"
    echo "the Enterprise App in the SSO tenant so its users can sign in:"
    echo ""
    echo -e "  ${GREEN}${ADMIN_CONSENT_URL}${NC}"
    echo ""
    echo "Until consent is granted, users from the SSO tenant will see an error such as"
    echo "\"need admin approval\" (AADSTS65001) when they try to sign in."
    echo ""
    read -p "Press Enter to continue (you can send the URL to that admin later)... " _
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
- Mode: External-Tenant Azure AD SSO + Local Authentication
- SSO (users') Tenant ID: $AZURE_TENANT_ID
- Host App Registration Client ID: $AZURE_CLIENT_ID
- Redirect URI: $STATIC_WEB_APP_URL
- Initial promaster email(s): ${INITIAL_PROMASTER_EMAILS:-none set (assign roles via the local admin)}
- SSO tenant admin-consent URL (must be granted once by an SSO-tenant admin):
  $ADMIN_CONSENT_URL
EOF
else
cat >> deployment-info.txt << EOF
- Mode: Local Authentication Only
- Azure AD: Not configured (can be added later)
EOF
fi

cat >> deployment-info.txt << EOF

Initial Admin Credentials:
- Username: $ADMIN_EMAIL
- Password: (the admin password you set during install)
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
2. Have an SSO-tenant admin grant consent using the admin-consent URL above
   (creates the Enterprise App in your users' tenant).
3. SSO users can then sign in. Anyone listed in "Initial promaster email(s)"
   becomes an admin on first login; everyone else starts as a normal 'user'.
   You can also sign in with the seeded local admin below to assign roles.
EOF
else
cat >> deployment-info.txt << EOF
2. Log in with the initial admin credentials:
   - Username: $ADMIN_EMAIL
   - Password: (the admin password you set during install)
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
    echo "  • External-tenant SSO configured (host app registration set multi-tenant)"
else
    echo "  • Local authentication configured (SSO skipped)"
fi
echo "  • Function App environment variables set"
echo "  • Frontend built and deployed"
echo
echo "🔑 Initial Admin Credentials:"
echo "  • Username: $ADMIN_EMAIL"
echo "  • Password: (the admin password you set during install)"
echo "  • Role:     promaster (full admin access)"
echo "  ⚠️  IMPORTANT: Change this password after first login!"
echo
echo "🎯 Next Steps:"
if [ -n "$AZURE_TENANT_ID" ]; then
    echo "  1. Have an SSO-tenant admin grant consent (URL shown above and saved to"
    echo "     deployment-info.txt) so your users' tenant trusts the app"
    echo "  2. Visit: $STATIC_WEB_APP_URL and sign in with SSO,"
    echo "     OR use the local admin account above"
else
    echo "  1. Visit: $STATIC_WEB_APP_URL"
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
