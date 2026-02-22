#!/bin/bash
# Configure deployed application with B2C settings

set -e

echo "=== Configuring CPS230 Deployment with B2C ==="
echo ""

# Load B2C configuration
if [ ! -f .b2c-config.env ]; then
  echo "ERROR: .b2c-config.env not found. Please run ./setup-b2c.sh first."
  exit 1
fi

source .b2c-config.env

echo "Using configuration:"
echo "  Tenant: $B2C_TENANT_NAME"
echo "  Client ID: $B2C_CLIENT_ID"
echo ""

# Switch back to main subscription
echo "Switching to main subscription..."
az login
az account set --subscription "CPS"

# Update Function App settings
echo ""
echo "Updating Function App settings..."
az functionapp config appsettings set \
  --name func-cps230-dev-w4n7p6pwjelzi \
  --resource-group rg-cps230-dev \
  --settings \
    AZURE_AD_B2C_TENANT_NAME="$B2C_TENANT_NAME" \
    AZURE_AD_B2C_CLIENT_ID="$B2C_CLIENT_ID" \
    AZURE_AD_B2C_POLICY_NAME="$B2C_POLICY_NAME" \
  --output none

echo "✓ Function App configured"

# Update frontend environment
echo ""
echo "Updating frontend configuration..."
cat > .env.production << EOF
VITE_API_URL=https://func-cps230-dev-w4n7p6pwjelzi.azurewebsites.net/api
VITE_B2C_TENANT_NAME=$B2C_TENANT_NAME
VITE_B2C_CLIENT_ID=$B2C_CLIENT_ID
VITE_B2C_POLICY_NAME=$B2C_POLICY_NAME
EOF

echo "✓ Environment file updated"

# Rebuild frontend
echo ""
echo "Building frontend..."
npm run build

# Redeploy to Static Web App
echo ""
echo "Deploying frontend to production..."
npx @azure/static-web-apps-cli deploy \
  --deployment-token "a58cbfcdde6dc739a99c041a63f2290f0b40a87877818ad8ead82e7e74836d8604-a8f8a8d9-6030-4ef5-8326-40a242e94dbc000151001fb2d300" \
  --app-location ./ \
  --output-location dist \
  --env production

echo ""
echo "=== Configuration Complete! ==="
echo ""
echo "Your application is now configured and deployed:"
echo "  URL: https://ambitious-meadow-01fb2d300.4.azurestaticapps.net"
echo ""
echo "NEXT STEPS:"
echo "1. Visit the URL above"
echo "2. Click 'Sign Up' to create your account"
echo "3. Use email: jonathan@palouse.io"
echo "4. After signing up, promote yourself to Promaster:"
echo ""
echo "   psql \"host=psql-cps230-dev-w4n7p6pwjelzi.postgres.database.azure.com dbname=cps230 user=cps230admin sslmode=require\""
echo ""
echo "   In psql:"
echo "   UPDATE user_profiles SET role = 'promaster' WHERE email = 'jonathan@palouse.io';"
echo ""
