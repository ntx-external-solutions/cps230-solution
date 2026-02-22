#!/bin/bash
# Azure AD B2C Setup Script
# This script will configure your B2C application after you create the tenant

set -e

echo "=== CPS230 Azure AD B2C Setup ==="
echo ""

# Prompt for B2C tenant name
read -p "Enter your B2C tenant name (e.g., cps230solution): " B2C_TENANT_NAME
B2C_TENANT_DOMAIN="${B2C_TENANT_NAME}.onmicrosoft.com"

echo ""
echo "Switching to B2C tenant..."
az login --tenant "$B2C_TENANT_DOMAIN" --allow-no-subscriptions

echo ""
echo "Creating app registration..."

# Create the application registration
APP_JSON=$(az ad app create \
  --display-name "CPS230 Web Application" \
  --sign-in-audience "AzureADMyOrg" \
  --web-redirect-uris \
    "https://ambitious-meadow-01fb2d300.4.azurestaticapps.net" \
    "http://localhost:8080" \
  --enable-access-token-issuance true \
  --enable-id-token-issuance true)

CLIENT_ID=$(echo $APP_JSON | jq -r '.appId')
echo "✓ Application created"
echo "  Client ID: $CLIENT_ID"

# Configure SPA platform
echo ""
echo "Configuring SPA platform..."
az ad app update \
  --id "$CLIENT_ID" \
  --spa-redirect-uris \
    "https://ambitious-meadow-01fb2d300.4.azurestaticapps.net" \
    "http://localhost:8080"

echo "✓ SPA platform configured"

# Save configuration
echo ""
echo "Saving configuration..."
cat > .b2c-config.env << EOF
B2C_TENANT_NAME=$B2C_TENANT_NAME
B2C_CLIENT_ID=$CLIENT_ID
B2C_POLICY_NAME=B2C_1_signupsignin
EOF

echo "✓ Configuration saved to .b2c-config.env"

echo ""
echo "=== Configuration Complete ==="
echo ""
echo "Tenant: $B2C_TENANT_DOMAIN"
echo "Client ID: $CLIENT_ID"
echo ""
echo "NEXT STEP: Create the user flow in the Azure Portal:"
echo "1. Go to: https://portal.azure.com"
echo "2. Switch to your B2C tenant ($B2C_TENANT_NAME)"
echo "3. Search for 'Azure AD B2C'"
echo "4. Click 'User flows' → 'New user flow'"
echo "5. Select 'Sign up and sign in' → 'Recommended'"
echo "6. Name: signupsignin"
echo "7. Identity providers: ✓ Email signup"
echo "8. User attributes:"
echo "   - Collect: Email Address, Display Name"
echo "   - Return: Email Addresses, Display Name, User's Object ID"
echo "9. Click 'Create'"
echo ""
echo "After creating the user flow, run: ./configure-deployment.sh"
