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

# Check if deployment-info.txt exists
if [ ! -f "deployment-info.txt" ]; then
    print_error "deployment-info.txt not found. This script should be run from a deployed CPS230 instance."
    print_info "If this is a new deployment, please run ./deploy.sh instead."
    exit 1
fi

# Extract deployment information
RESOURCE_GROUP=$(grep "Resource Group:" deployment-info.txt | cut -d':' -f2 | xargs)
FUNCTION_APP_NAME=$(grep "Function App:" deployment-info.txt | cut -d':' -f2 | xargs)
STATIC_WEB_APP_NAME=$(grep "Static Web App:" deployment-info.txt | cut -d':' -f2- | xargs | cut -d'.' -f1 | sed 's/https:\/\///')
POSTGRES_FQDN=$(grep "PostgreSQL Server:" deployment-info.txt | cut -d':' -f2 | xargs)
POSTGRES_DB=$(grep "PostgreSQL Database:" deployment-info.txt | cut -d':' -f2 | xargs)

print_info "Detected deployment:"
print_info "  - Resource Group: $RESOURCE_GROUP"
print_info "  - Function App: $FUNCTION_APP_NAME"
print_info "  - Static Web App: $STATIC_WEB_APP_NAME"
print_info "  - PostgreSQL Server: $POSTGRES_FQDN"

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

                    if PGPASSWORD="$POSTGRES_PASSWORD" psql -h "$POSTGRES_HOST" -U "$POSTGRES_USER" -d "$POSTGRES_DB" -f "$migration"; then
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

STATIC_WEB_APP_URL=$(grep "Web Application:" deployment-info.txt | cut -d':' -f2- | xargs)

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
echo "  • Backend rebuilt and deployed"
echo "  • Frontend rebuilt and deployed"
echo ""
echo "🎯 Next Steps:"
echo "  1. Visit your application to verify the update"
echo "  2. Test critical functionality"
echo "  3. Check for any breaking changes in the release notes"
echo ""

print_info "Update script completed successfully!"
