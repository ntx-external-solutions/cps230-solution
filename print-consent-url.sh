#!/bin/bash
# CPS230 Solution - Print the SSO tenant admin-consent URL
#
# External-tenant SSO requires a one-time admin consent in the USERS' (SSO)
# tenant. Granting it creates the Enterprise App there so that tenant's users can
# sign in. This helper regenerates that consent URL after deployment — hand it to
# a Global Administrator of the SSO tenant.
#
# Usage:
#   ./print-consent-url.sh <resource-group>
#       Discover the Function App in the resource group and read the SSO tenant,
#       host client ID, and app URL from its settings.
#
#   ./print-consent-url.sh --tenant <sso-tenant-id> --client <host-client-id> \
#                          --url <app-url>
#       Build the URL from explicit values (no Azure lookup).

set -e

GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

print_info()  { echo -e "${GREEN}[INFO]${NC} $1"; }
print_error() { echo -e "${RED}[ERROR]${NC} $1"; }
print_warn()  { echo -e "${YELLOW}[WARN]${NC} $1"; }

RESOURCE_GROUP=""
AZURE_TENANT_ID=""
AZURE_CLIENT_ID=""
APP_URL=""

# Parse arguments: first bare word is the resource group; flags override.
while [ $# -gt 0 ]; do
    case "$1" in
        --tenant) AZURE_TENANT_ID="$2"; shift 2 ;;
        --client) AZURE_CLIENT_ID="$2"; shift 2 ;;
        --url)    APP_URL="$2"; shift 2 ;;
        -h|--help)
            grep '^#' "$0" | sed 's/^# \{0,1\}//' | sed '1d'
            exit 0 ;;
        -*)
            print_error "Unknown option: $1"; exit 1 ;;
        *)
            RESOURCE_GROUP="$1"; shift ;;
    esac
done

# If any value is missing and we have a resource group, discover from Azure.
if [ -z "$AZURE_TENANT_ID" ] || [ -z "$AZURE_CLIENT_ID" ] || [ -z "$APP_URL" ]; then
    if [ -z "$RESOURCE_GROUP" ]; then
        print_error "Provide a resource group, or pass --tenant, --client and --url explicitly."
        echo "Usage: $0 <resource-group>"
        exit 1
    fi

    if ! command -v az &> /dev/null; then
        print_error "Azure CLI is not installed and explicit values were not provided."
        exit 1
    fi
    if ! az account show &> /dev/null; then
        print_error "Not logged in to Azure. Run 'az login' first (host tenant)."
        exit 1
    fi

    print_info "Discovering Function App in resource group '$RESOURCE_GROUP'..."
    FUNCTION_APP_NAME=$(az functionapp list --resource-group "$RESOURCE_GROUP" --query "[0].name" -o tsv 2>/dev/null)
    if [ -z "$FUNCTION_APP_NAME" ]; then
        print_error "Could not find a Function App in '$RESOURCE_GROUP'."
        exit 1
    fi
    print_info "Function App: $FUNCTION_APP_NAME"

    # Read the settings the deploy wrote. One call, then pluck each value.
    SETTINGS_JSON=$(az functionapp config appsettings list \
        --name "$FUNCTION_APP_NAME" --resource-group "$RESOURCE_GROUP" -o json 2>/dev/null)

    get_setting() { echo "$SETTINGS_JSON" | jq -r --arg k "$1" '.[] | select(.name==$k) | .value' 2>/dev/null; }

    [ -z "$AZURE_TENANT_ID" ] && AZURE_TENANT_ID=$(get_setting AZURE_TENANT_ID)
    [ -z "$AZURE_CLIENT_ID" ] && AZURE_CLIENT_ID=$(get_setting AZURE_CLIENT_ID)
    [ -z "$APP_URL" ] && APP_URL=$(get_setting STATIC_WEB_APP_URL)
fi

if [ -z "$AZURE_TENANT_ID" ] || [ -z "$AZURE_CLIENT_ID" ]; then
    print_error "SSO is not configured (AZURE_TENANT_ID / AZURE_CLIENT_ID are empty)."
    print_warn  "Configure SSO first via ./deploy.sh or Manage-Access.ps1 -Action ConfigureSso."
    exit 1
fi
if [ -z "$APP_URL" ]; then
    print_warn "Could not determine the app URL; the consent redirect_uri may be wrong."
    print_warn "Pass --url <app-url> to set it explicitly."
fi

CONSENT_URL="https://login.microsoftonline.com/${AZURE_TENANT_ID}/adminconsent?client_id=${AZURE_CLIENT_ID}&redirect_uri=${APP_URL}"

echo ""
print_info "SSO (users') tenant:        $AZURE_TENANT_ID"
print_info "Host App Registration:      $AZURE_CLIENT_ID"
print_info "Redirect URI:               ${APP_URL:-<unknown>}"
echo ""
echo "A Global Administrator of the SSO tenant must open this URL once to create"
echo "the Enterprise App so that tenant's users can sign in:"
echo ""
echo -e "  ${GREEN}${CONSENT_URL}${NC}"
echo ""
echo "Until consent is granted, users see \"need admin approval\" (AADSTS65001)."
