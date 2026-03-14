#!/bin/bash
# CPS230 Solution - Customer Package Verification
# This script verifies that the customer package contains all required files and configurations

set -e

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}=== CPS230 Customer Package Verification ===${NC}\n"

ERRORS=0
WARNINGS=0

print_check() {
    echo -e "${GREEN}✓${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}⚠${NC} $1"
    ((WARNINGS++))
}

print_error() {
    echo -e "${RED}✗${NC} $1"
    ((ERRORS++))
}

# Check required files exist
echo -e "${BLUE}Checking required files...${NC}"
REQUIRED_FILES=(
    "README.md"
    "DEPLOYMENT.md"
    "CUSTOMER_DEPLOYMENT_CHECKLIST.md"
    ".env.example"
    ".gitignore"
    "deploy.sh"
    "prepare-customer-package.sh"
    "infrastructure/main.bicep"
    "database/schema.sql"
    "database/init-database.sh"
    "database/create-initial-admin.sh"
    "backend/package.json"
    "package.json"
)

for file in "${REQUIRED_FILES[@]}"; do
    if [ -f "$file" ]; then
        print_check "Found: $file"
    else
        print_error "Missing: $file"
    fi
done

# Check that sensitive files don't exist
echo -e "\n${BLUE}Checking for sensitive files (should NOT exist)...${NC}"
SENSITIVE_FILES=(
    ".env"
    ".env.local"
    ".env.production"
    "deployment-output.json"
    "deployment-info.txt"
    "app-registration.json"
    "DEPLOYMENT_INFO.txt"
    "DEPLOYMENT_SUMMARY.txt"
)

for file in "${SENSITIVE_FILES[@]}"; do
    if [ -f "$file" ]; then
        print_error "Found sensitive file (should be removed): $file"
    else
        print_check "Not found (good): $file"
    fi
done

# Check deploy.sh for required features
echo -e "\n${BLUE}Checking deploy.sh for required features...${NC}"

if grep -q "url_encode()" deploy.sh; then
    print_check "deploy.sh has URL encoding function"
else
    print_error "deploy.sh missing URL encoding function"
fi

if grep -q "create-initial-admin.sh" deploy.sh; then
    print_check "deploy.sh calls create-initial-admin.sh"
else
    print_error "deploy.sh doesn't call create-initial-admin.sh"
fi

if grep -q "Configure Azure AD SSO now?" deploy.sh; then
    print_check "deploy.sh has optional Azure AD configuration"
else
    print_error "deploy.sh missing optional Azure AD prompt"
fi

if grep -q "CONFIGURE_AZURE_AD=\${CONFIGURE_AZURE_AD:-no}" deploy.sh; then
    print_check "deploy.sh defaults to no Azure AD (local auth only)"
else
    print_warning "deploy.sh may not default to local auth"
fi

# Check backend auth.ts for security fixes
echo -e "\n${BLUE}Checking backend security fixes...${NC}"

if grep -q "if (clientId && tenantId)" backend/shared/auth.ts; then
    print_check "auth.ts has Azure AD optional check"
else
    print_error "auth.ts missing Azure AD optional check"
fi

if grep -q "authenticateRequestUnified" backend/shared/auth.ts; then
    print_check "auth.ts has unified authentication function"
else
    print_error "auth.ts missing unified authentication"
fi

# Check backend jwt.ts for security
if grep -q "JWT_SECRET environment variable must be set" backend/shared/jwt.ts; then
    print_check "jwt.ts validates JWT_SECRET is set"
else
    print_error "jwt.ts doesn't validate JWT_SECRET"
fi

if grep -q "JWT_SECRET must be at least 32 characters" backend/shared/jwt.ts; then
    print_check "jwt.ts validates JWT_SECRET length"
else
    print_error "jwt.ts doesn't validate JWT_SECRET length"
fi

# Check frontend auth fixes
echo -e "\n${BLUE}Checking frontend authentication fixes...${NC}"

if grep -q "if (!user && !profile)" src/components/ProtectedRoute.tsx; then
    print_check "ProtectedRoute checks for both user and profile"
else
    print_error "ProtectedRoute doesn't check for local auth profile"
fi

if grep -q 'navigate(\x27/dashboard\x27)' src/pages/Login.tsx; then
    print_check "Login.tsx has explicit navigation after login"
else
    print_warning "Login.tsx may not navigate after login"
fi

if grep -q "/user-profiles?id=" src/contexts/AuthContext.tsx; then
    print_check "AuthContext uses correct API endpoint format"
else
    print_error "AuthContext may use wrong API endpoint format"
fi

# Check .gitignore
echo -e "\n${BLUE}Checking .gitignore...${NC}"

if grep -q "^.env$" .gitignore; then
    print_check ".gitignore blocks .env files"
else
    print_error ".gitignore doesn't block .env files"
fi

if grep -q "deployment-output.json" .gitignore; then
    print_check ".gitignore blocks deployment outputs"
else
    print_error ".gitignore doesn't block deployment outputs"
fi

# Check documentation
echo -e "\n${BLUE}Checking documentation...${NC}"

if grep -q "URL encoding" CUSTOMER_DEPLOYMENT_CHECKLIST.md; then
    print_check "CUSTOMER_DEPLOYMENT_CHECKLIST.md documents URL encoding"
else
    print_warning "CUSTOMER_DEPLOYMENT_CHECKLIST.md may be missing URL encoding docs"
fi

if grep -q "Initial Admin User" CUSTOMER_DEPLOYMENT_CHECKLIST.md; then
    print_check "CUSTOMER_DEPLOYMENT_CHECKLIST.md documents initial admin"
else
    print_warning "CUSTOMER_DEPLOYMENT_CHECKLIST.md may be missing initial admin docs"
fi

# Check database scripts
echo -e "\n${BLUE}Checking database scripts...${NC}"

if [ -x "database/init-database.sh" ]; then
    print_check "database/init-database.sh is executable"
else
    print_warning "database/init-database.sh is not executable"
fi

if [ -x "database/create-initial-admin.sh" ]; then
    print_check "database/create-initial-admin.sh is executable"
else
    print_warning "database/create-initial-admin.sh is not executable"
fi

if [ -x "deploy.sh" ]; then
    print_check "deploy.sh is executable"
else
    print_warning "deploy.sh is not executable"
fi

# Check for node_modules (should not exist in package)
echo -e "\n${BLUE}Checking for build artifacts (should NOT exist)...${NC}"

if [ -d "node_modules" ]; then
    print_warning "node_modules directory exists (should be removed for customer package)"
else
    print_check "node_modules not found (good)"
fi

if [ -d "backend/node_modules" ]; then
    print_warning "backend/node_modules directory exists (should be removed for customer package)"
else
    print_check "backend/node_modules not found (good)"
fi

if [ -d "dist" ]; then
    print_warning "dist directory exists (should be removed for customer package)"
else
    print_check "dist not found (good)"
fi

# Summary
echo -e "\n${BLUE}=== Verification Summary ===${NC}"
echo -e "Errors:   ${RED}$ERRORS${NC}"
echo -e "Warnings: ${YELLOW}$WARNINGS${NC}"

if [ $ERRORS -eq 0 ] && [ $WARNINGS -eq 0 ]; then
    echo -e "\n${GREEN}✓ Package verification passed!${NC}"
    echo -e "The customer package is ready for distribution."
    exit 0
elif [ $ERRORS -eq 0 ]; then
    echo -e "\n${YELLOW}⚠ Package verification passed with warnings${NC}"
    echo -e "Review warnings above before distributing."
    exit 0
else
    echo -e "\n${RED}✗ Package verification failed!${NC}"
    echo -e "Fix errors above before distributing."
    exit 1
fi
