#!/bin/bash
# CPS230 Solution - Customer Update Script
# This script pulls the latest code, applies database migrations, and deploys updates
# Usage: ./customer-update.sh

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

# Get script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

print_section "CPS230 Solution - Customer Update"

# Display current version
if [ -f "VERSION" ]; then
    CURRENT_VERSION=$(cat VERSION | tr -d '[:space:]')
    print_info "Current version: $CURRENT_VERSION"
else
    print_warning "VERSION file not found"
fi

# Ensure Azure CLI is available and logged in (needed to read settings/discover
# resources and to deploy).
if ! command -v az &> /dev/null; then
    print_error "Azure CLI is not installed. Install from https://aka.ms/azure-cli"
    exit 1
fi
if ! az account show &> /dev/null; then
    print_error "Not logged in to Azure. Run 'az login' first."
    exit 1
fi

# Determine the target deployment. Priority:
#   1. Resource group passed as an argument (or RESOURCE_GROUP env var)
#   2. deployment-info.txt in the current directory (written by deploy.sh)
# With (1), resources are discovered from Azure, so an admin can upgrade from a
# fresh clone without the original deploy machine's deployment-info.txt.
RESOURCE_GROUP="${1:-${RESOURCE_GROUP:-}}"
FUNCTION_APP_NAME=""
STATIC_WEB_APP_NAME=""

if [ -z "$RESOURCE_GROUP" ] && [ -f "deployment-info.txt" ]; then
    print_info "Reading deployment coordinates from deployment-info.txt"
    RESOURCE_GROUP=$(grep "Resource Group:" deployment-info.txt | cut -d':' -f2 | xargs)
    FUNCTION_APP_NAME=$(grep "Function App:" deployment-info.txt | cut -d':' -f2 | xargs)
    STATIC_WEB_APP_NAME=$(grep "Static Web App:" deployment-info.txt | cut -d':' -f2- | xargs | cut -d'.' -f1 | sed 's/https:\/\///')
fi

if [ -z "$RESOURCE_GROUP" ]; then
    print_error "No target resource group. Pass it as an argument:"
    print_info "  ./customer-update.sh <resource-group>"
    print_info "(or run from a directory containing deployment-info.txt from the original deploy)"
    exit 1
fi

# Discover any resources we don't already have from Azure.
if [ -z "$FUNCTION_APP_NAME" ]; then
    print_info "Discovering Function App in '$RESOURCE_GROUP'..."
    FUNCTION_APP_NAME=$(az functionapp list --resource-group "$RESOURCE_GROUP" --query "[0].name" -o tsv 2>/dev/null)
fi
if [ -z "$STATIC_WEB_APP_NAME" ]; then
    print_info "Discovering Static Web App in '$RESOURCE_GROUP'..."
    STATIC_WEB_APP_NAME=$(az staticwebapp list --resource-group "$RESOURCE_GROUP" --query "[0].name" -o tsv 2>/dev/null)
fi

if [ -z "$FUNCTION_APP_NAME" ] || [ -z "$STATIC_WEB_APP_NAME" ]; then
    print_error "Could not find a Function App and/or Static Web App in '$RESOURCE_GROUP'."
    print_info "Check the resource group name and that you're logged into the right subscription."
    exit 1
fi

print_info "Detected deployment:"
print_info "  - Resource Group: $RESOURCE_GROUP"
print_info "  - Function App: $FUNCTION_APP_NAME"
print_info "  - Static Web App: $STATIC_WEB_APP_NAME"

# Confirm update
echo ""
read -p "Do you want to proceed with updating this deployment? (yes/no): " CONFIRM
if [ "$CONFIRM" != "yes" ]; then
    print_warning "Update cancelled"
    exit 0
fi

# Check if this is a git repository
print_section "Checking for Updates"

if [ -d ".git" ]; then
    print_info "Git repository detected. Pulling latest changes..."

    # Stash any local changes
    if ! git diff-index --quiet HEAD --; then
        print_warning "Local changes detected. Stashing them..."
        git stash save "Auto-stash before customer-update at $(date)"
    fi

    # Pull latest changes
    git pull

    if [ $? -eq 0 ]; then
        print_info "Code updated successfully"
    else
        print_error "Git pull failed. Please resolve conflicts and try again."
        exit 1
    fi
else
    print_warning "Not a git repository. Assuming code is already up to date."
    print_info "If you want automatic updates, initialize this as a git repository:"
    print_info "  git init"
    print_info "  git remote add origin <repository-url>"
fi

# Display new version after update
if [ -f "VERSION" ]; then
    NEW_VERSION=$(cat VERSION | tr -d '[:space:]')
    if [ -n "$CURRENT_VERSION" ] && [ "$CURRENT_VERSION" != "$NEW_VERSION" ]; then
        print_info "Upgrading from v${CURRENT_VERSION} to v${NEW_VERSION}"
        if [ -f "CHANGELOG.md" ]; then
            print_info "See CHANGELOG.md for details on what changed"
        fi
    else
        print_info "Version: $NEW_VERSION"
    fi
fi

# Update infrastructure (optional)
print_section "Infrastructure Update"

echo "Would you like to update the Azure infrastructure?"
echo "This is recommended if the new version includes infrastructure changes."
echo "It is safe to re-run - Bicep deployments are idempotent."
echo ""
read -p "Update infrastructure? (yes/no): " UPDATE_INFRA
if [ "$UPDATE_INFRA" = "yes" ]; then
    if [ -f "infrastructure/main.bicep" ]; then
        # Determine environment from resource group name
        ENVIRONMENT=$(echo "$RESOURCE_GROUP" | sed 's/.*-//')

        print_info "Deploying infrastructure updates (environment: $ENVIRONMENT)..."
        az deployment sub create \
            --location australiaeast \
            --template-file infrastructure/main.bicep \
            --parameters "infrastructure/parameters/${ENVIRONMENT}.parameters.json" \
            --parameters environmentName="$ENVIRONMENT"

        if [ $? -eq 0 ]; then
            print_info "Infrastructure updated successfully"
        else
            print_warning "Infrastructure update failed. This may require manual intervention."
            print_info "You can continue - the code update will still proceed."
        fi
    else
        print_warning "infrastructure/main.bicep not found. Skipping infrastructure update."
    fi
else
    print_info "Skipping infrastructure update"
fi

# Get database credentials from Azure Function App
print_section "Retrieving Database Credentials"

print_info "Getting database credentials from Azure Function App..."
DB_SETTINGS=$(az functionapp config appsettings list \
    --name "$FUNCTION_APP_NAME" \
    --resource-group "$RESOURCE_GROUP" \
    --query "[?name=='POSTGRES_HOST' || name=='POSTGRES_DB' || name=='POSTGRES_USER' || name=='POSTGRES_PASSWORD'].{name:name, value:value}" \
    --output json)

export POSTGRES_HOST=$(echo $DB_SETTINGS | jq -r '.[] | select(.name=="POSTGRES_HOST") | .value')
export POSTGRES_DB=$(echo $DB_SETTINGS | jq -r '.[] | select(.name=="POSTGRES_DB") | .value')
export POSTGRES_USER=$(echo $DB_SETTINGS | jq -r '.[] | select(.name=="POSTGRES_USER") | .value')
export POSTGRES_PASSWORD=$(echo $DB_SETTINGS | jq -r '.[] | select(.name=="POSTGRES_PASSWORD") | .value')

if [ -z "$POSTGRES_HOST" ] || [ -z "$POSTGRES_PASSWORD" ]; then
    print_error "Failed to retrieve database credentials from Azure"
    exit 1
fi

print_info "Database credentials retrieved successfully"

# Allow this machine to reach PostgreSQL for the migration step.
# The server is normally only open to Azure services, so the psql commands below
# (run from THIS machine) fail with "Failed to connect" unless the current public
# IP is whitelisted. deploy.sh does the same on a clean install.
print_section "Configuring Database Firewall"
POSTGRES_SERVER_NAME="${POSTGRES_HOST%%.*}"
CURRENT_IP=$(curl -s https://api.ipify.org)
if [ -n "$CURRENT_IP" ]; then
    print_info "Adding this machine's IP ($CURRENT_IP) to the PostgreSQL firewall..."
    az postgres flexible-server firewall-rule create \
        --resource-group "$RESOURCE_GROUP" \
        --name "$POSTGRES_SERVER_NAME" \
        --rule-name "update-machine" \
        --start-ip-address "$CURRENT_IP" \
        --end-ip-address "$CURRENT_IP" \
        --output none 2>/dev/null \
        && print_info "Firewall rule added (or already present)" \
        || print_warning "Could not add firewall rule; migrations may fail to connect"
else
    print_warning "Could not determine public IP; migrations may fail to connect"
fi

# Apply database migrations
print_section "Applying Database Migrations"

if command -v psql &> /dev/null; then
    print_info "Checking for new migrations..."

    # Check if database has a migrations tracking table
    MIGRATION_TABLE_EXISTS=$(PGPASSWORD="$POSTGRES_PASSWORD" psql -h "$POSTGRES_HOST" -U "$POSTGRES_USER" -d "$POSTGRES_DB" -tAc "SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'schema_migrations');")

    if [ "$MIGRATION_TABLE_EXISTS" = "f" ]; then
        print_info "Creating schema_migrations tracking table..."
        PGPASSWORD="$POSTGRES_PASSWORD" psql -h "$POSTGRES_HOST" -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "
            CREATE TABLE IF NOT EXISTS public.schema_migrations (
                version VARCHAR(255) PRIMARY KEY,
                applied_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
        "
    fi

    # Apply each migration that hasn't been applied yet
    if [ -d "database/migrations" ]; then
        for migration in database/migrations/*.sql; do
            if [ -f "$migration" ]; then
                MIGRATION_NAME=$(basename "$migration" .sql)

                # Check if migration has already been applied
                APPLIED=$(PGPASSWORD="$POSTGRES_PASSWORD" psql -h "$POSTGRES_HOST" -U "$POSTGRES_USER" -d "$POSTGRES_DB" -tAc "SELECT EXISTS (SELECT 1 FROM schema_migrations WHERE version = '$MIGRATION_NAME');")

                if [ "$APPLIED" = "f" ]; then
                    print_info "Applying migration: $MIGRATION_NAME"

                    # ON_ERROR_STOP=1 so a real SQL error fails the migration (and
                    # the upgrade) instead of being silently swallowed and recorded
                    # as applied. Safe because the migrations are idempotent.
                    if PGPASSWORD="$POSTGRES_PASSWORD" psql -v ON_ERROR_STOP=1 -h "$POSTGRES_HOST" -U "$POSTGRES_USER" -d "$POSTGRES_DB" -f "$migration"; then
                        # Record successful migration
                        PGPASSWORD="$POSTGRES_PASSWORD" psql -h "$POSTGRES_HOST" -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "INSERT INTO schema_migrations (version) VALUES ('$MIGRATION_NAME');"
                        print_info "Migration $MIGRATION_NAME applied successfully"
                    else
                        print_error "Failed to apply migration: $MIGRATION_NAME"
                        exit 1
                    fi
                else
                    print_info "Migration $MIGRATION_NAME already applied (skipping)"
                fi
            fi
        done
    else
        print_info "No migrations directory found"
    fi

    print_info "All migrations applied successfully"
else
    print_warning "psql not found. Skipping database migrations."
    print_info "Install PostgreSQL client to enable automatic migration application."
fi

unset POSTGRES_PASSWORD

# Update backend
print_section "Updating Backend"

print_info "Installing backend dependencies..."
cd backend
cp ../VERSION VERSION 2>/dev/null || true
npm install

print_info "Building backend..."
npm run build

print_info "Deploying backend to Azure Functions..."
if command -v func &> /dev/null; then
    func azure functionapp publish "$FUNCTION_APP_NAME" --typescript

    if [ $? -eq 0 ]; then
        print_info "Backend deployed successfully"
    else
        print_error "Backend deployment failed"
        exit 1
    fi
else
    print_error "Azure Functions Core Tools not found"
    print_info "Install from: https://docs.microsoft.com/en-us/azure/azure-functions/functions-run-local"
    exit 1
fi

cd ..

# Reconcile external-tenant SSO configuration.
#
# Older instances were configured for single-tenant SSO (app and users in the
# same tenant) and predate the INITIAL_PROMASTER_EMAILS / ENABLE_AAD_USER_MANAGEMENT
# settings and the multi-tenant app registration. This step brings an existing
# deployment up to the external-tenant model without a full redeploy. It runs
# BEFORE the frontend rebuild below so any change to the SSO tenant is baked into
# the new frontend bundle.
print_section "Reconciling SSO Configuration"

ADMIN_CONSENT_URL=""

SSO_SETTINGS=$(az functionapp config appsettings list \
    --name "$FUNCTION_APP_NAME" \
    --resource-group "$RESOURCE_GROUP" \
    --query "[?name=='AZURE_TENANT_ID' || name=='AZURE_CLIENT_ID' || name=='INITIAL_PROMASTER_EMAILS' || name=='ENABLE_AAD_USER_MANAGEMENT' || name=='STATIC_WEB_APP_URL'].{name:name, value:value}" \
    --output json)

CUR_TENANT=$(echo "$SSO_SETTINGS" | jq -r '.[] | select(.name=="AZURE_TENANT_ID") | .value')
CUR_CLIENT=$(echo "$SSO_SETTINGS" | jq -r '.[] | select(.name=="AZURE_CLIENT_ID") | .value')
CUR_PROMASTERS=$(echo "$SSO_SETTINGS" | jq -r '.[] | select(.name=="INITIAL_PROMASTER_EMAILS") | .value')
CUR_AAD_MGMT=$(echo "$SSO_SETTINGS" | jq -r '.[] | select(.name=="ENABLE_AAD_USER_MANAGEMENT") | .value')
CUR_APP_URL=$(echo "$SSO_SETTINGS" | jq -r '.[] | select(.name=="STATIC_WEB_APP_URL") | .value')

if [ -z "$CUR_TENANT" ] || [ -z "$CUR_CLIENT" ]; then
    print_info "SSO is not configured on this deployment (local authentication only)."
    print_info "To add external-tenant SSO, run ./deploy.sh (SSO step) or:"
    print_info "  Manage-Access.ps1 -Action ConfigureSso"
else
    echo "This release supports SSO for users in a SEPARATE Azure AD (Entra) tenant"
    echo "from the one hosting the app. Current SSO settings:"
    echo "  - SSO (users') tenant ID:      ${CUR_TENANT}"
    echo "  - Host App Registration:       ${CUR_CLIENT}"
    echo "  - Initial promaster email(s):  ${CUR_PROMASTERS:-<none set>}"
    echo "  - In-directory user mgmt:      ${CUR_AAD_MGMT:-<unset> (treated as off)}"
    echo ""
    read -p "Review/update the SSO configuration now? (yes/no) [yes]: " REVIEW_SSO
    REVIEW_SSO=${REVIEW_SSO:-yes}

    if [ "$REVIEW_SSO" = "yes" ]; then
        echo ""
        echo "Press Enter to keep the current value shown in [brackets]."
        echo ""
        echo "If your users live in a DIFFERENT tenant than shown above (e.g. you are"
        echo "moving from single-tenant to external SSO), enter that tenant's ID here."
        read -p "  SSO (users') tenant ID [${CUR_TENANT}]: " NEW_TENANT
        NEW_TENANT=${NEW_TENANT:-$CUR_TENANT}

        read -p "  Initial promaster email(s), comma-separated [${CUR_PROMASTERS}]: " NEW_PROMASTERS
        NEW_PROMASTERS=${NEW_PROMASTERS:-$CUR_PROMASTERS}

        # Ensure the host App Registration accepts users from other tenants.
        # Without this, external users cannot sign in (AADSTS50020 / AADSTS700016).
        print_info "Ensuring the host App Registration is multi-tenant..."
        CURRENT_AUDIENCE=$(az ad app show --id "$CUR_CLIENT" --query "signInAudience" -o tsv 2>/dev/null || echo "")
        if [ "$CURRENT_AUDIENCE" = "AzureADMultipleOrgs" ] || [ "$CURRENT_AUDIENCE" = "AzureADandPersonalMicrosoftAccount" ]; then
            print_info "App Registration is already multi-tenant ($CURRENT_AUDIENCE)"
        else
            az rest --method PATCH \
                --uri "https://graph.microsoft.com/v1.0/applications(appId='$CUR_CLIENT')" \
                --headers "Content-Type=application/json" \
                --body "{\"signInAudience\": \"AzureADMultipleOrgs\"}" \
                2>/dev/null \
                && print_info "App Registration set to multi-tenant (AzureADMultipleOrgs)" \
                || print_warning "Could not set multi-tenant flag; set 'Supported account types' to 'Accounts in any organizational directory' in the Azure Portal"
        fi

        print_info "Updating Function App SSO settings..."
        az functionapp config appsettings set \
            --name "$FUNCTION_APP_NAME" \
            --resource-group "$RESOURCE_GROUP" \
            --settings \
                AZURE_TENANT_ID="$NEW_TENANT" \
                INITIAL_PROMASTER_EMAILS="$NEW_PROMASTERS" \
                ENABLE_AAD_USER_MANAGEMENT="false" \
            --output none \
            && print_info "SSO settings updated" \
            || print_warning "Failed to update SSO settings"

        ADMIN_CONSENT_URL="https://login.microsoftonline.com/${NEW_TENANT}/adminconsent?client_id=${CUR_CLIENT}&redirect_uri=${CUR_APP_URL}"

        if [ "$NEW_TENANT" != "$CUR_TENANT" ]; then
            print_warning "SSO tenant changed ($CUR_TENANT -> $NEW_TENANT)."
            print_warning "An admin of the NEW tenant must grant consent (URL shown at the end)."
        fi
    else
        print_info "Leaving SSO configuration unchanged."
    fi
fi

# Update frontend
print_section "Updating Frontend"

# Get Azure AD configuration from Function App
print_info "Retrieving Azure AD configuration..."
AZURE_CONFIG=$(az functionapp config appsettings list \
    --name "$FUNCTION_APP_NAME" \
    --resource-group "$RESOURCE_GROUP" \
    --query "[?name=='AZURE_TENANT_ID' || name=='AZURE_CLIENT_ID' || name=='STATIC_WEB_APP_URL'].{name:name, value:value}" \
    --output json)

AZURE_TENANT_ID=$(echo $AZURE_CONFIG | jq -r '.[] | select(.name=="AZURE_TENANT_ID") | .value')
AZURE_CLIENT_ID=$(echo $AZURE_CONFIG | jq -r '.[] | select(.name=="AZURE_CLIENT_ID") | .value')
STATIC_WEB_APP_URL=$(echo $AZURE_CONFIG | jq -r '.[] | select(.name=="STATIC_WEB_APP_URL") | .value')

# Create production environment configuration
print_info "Creating production environment configuration..."
cat > .env.production << EOF
VITE_API_URL=https://${FUNCTION_APP_NAME}.azurewebsites.net/api
VITE_AZURE_TENANT_ID=$AZURE_TENANT_ID
VITE_AZURE_CLIENT_ID=$AZURE_CLIENT_ID
VITE_REDIRECT_URI=$STATIC_WEB_APP_URL
EOF

print_info "Installing frontend dependencies..."
npm install --legacy-peer-deps

print_info "Building frontend..."
npm run build

if [ $? -ne 0 ]; then
    print_error "Frontend build failed"
    exit 1
fi

print_info "Getting Static Web App deployment token..."
DEPLOY_TOKEN=$(az staticwebapp secrets list \
    --name "$STATIC_WEB_APP_NAME" \
    --resource-group "$RESOURCE_GROUP" \
    --query properties.apiKey -o tsv)

if [ -z "$DEPLOY_TOKEN" ]; then
    print_error "Failed to retrieve Static Web App deployment token"
    exit 1
fi

print_info "Deploying frontend to Azure Static Web App..."
npx @azure/static-web-apps-cli deploy ./dist \
    --deployment-token "$DEPLOY_TOKEN" \
    --env production

if [ $? -eq 0 ]; then
    print_info "Frontend deployed successfully"
else
    print_error "Frontend deployment failed"
    exit 1
fi

# Summary
print_section "Update Complete!"

# STATIC_WEB_APP_URL is already set from the Function App settings during the
# frontend update above (no dependency on deployment-info.txt).

FINAL_VERSION=$(cat VERSION 2>/dev/null | tr -d '[:space:]' || echo "unknown")
echo "Your CPS230 solution has been updated to v${FINAL_VERSION}!"
echo ""
echo "🌐 Application URL: $STATIC_WEB_APP_URL"
echo "🔗 API Endpoint: https://${FUNCTION_APP_NAME}.azurewebsites.net/api"
echo "📋 Version: $FINAL_VERSION"
echo ""
echo "✅ Update Status:"
echo "  • Code pulled from repository (if git enabled)"
echo "  • Infrastructure updated (if selected)"
echo "  • Database migrations applied"
echo "  • SSO configuration reconciled"
echo "  • Backend rebuilt and deployed"
echo "  • Frontend rebuilt and deployed"
echo ""
if [ -n "$ADMIN_CONSENT_URL" ]; then
    echo "🔐 SSO admin consent (grant once, in your users' tenant):"
    echo "   A Global Administrator of the SSO tenant must open this URL so that"
    echo "   tenant's users can sign in (skip if already granted for this tenant):"
    echo ""
    echo -e "   ${GREEN}${ADMIN_CONSENT_URL}${NC}"
    echo ""
    echo "   You can reprint it later with: ./print-consent-url.sh $RESOURCE_GROUP"
    echo ""
fi
echo "🎯 Next Steps:"
echo "  1. Visit your application to verify the update"
echo "  2. Test critical functionality"
echo "  3. Check for any breaking changes in the release notes"
echo ""

print_info "Update script completed successfully!"
