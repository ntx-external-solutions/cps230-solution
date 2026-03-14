#!/bin/bash
# CPS230 Solution - Prepare Customer Package
# This script removes sensitive files and prepares the solution for customer distribution

set -e

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${GREEN}=== CPS230 Customer Package Preparation ===${NC}\n"

# Confirm before proceeding
read -p "This will remove sensitive files. Continue? (yes/no): " CONFIRM
if [ "$CONFIRM" != "yes" ]; then
    echo -e "${YELLOW}Cancelled.${NC}"
    exit 0
fi

echo -e "\n${GREEN}Removing sensitive files...${NC}\n"

# Remove .env files (but keep .env.example)
echo "Removing .env files..."
find . -name ".env" -not -name ".env.example" -type f -exec rm -f {} + 2>/dev/null || true
find . -name ".env.local" -type f -exec rm -f {} + 2>/dev/null || true
find . -name ".env.production" -type f -exec rm -f {} + 2>/dev/null || true
find . -name ".env.development" -type f -exec rm -f {} + 2>/dev/null || true

# Remove deployment output files
echo "Removing deployment outputs..."
rm -f deployment-output.json
rm -f deployment-info.txt
rm -f app-registration.json
rm -f DEPLOYMENT_INFO.txt

# Remove deployment-specific documentation
echo "Removing deployment-specific documentation..."
rm -f *_SUMMARY.md
rm -f *_STATUS.md
rm -f *_COMPLETE.md
rm -f *_TRACKING.md
rm -f PROJECT_STATUS.md

# Remove ZIP files
echo "Removing ZIP archives..."
rm -f *.zip
rm -f backend/*.zip

# Remove backup files
echo "Removing backup files..."
find . -name "*.bak" -type f -delete 2>/dev/null || true
find . -name "*.tmp" -type f -delete 2>/dev/null || true

# Remove duplicate backend directory if it exists
if [ -d "backend/backend" ]; then
    echo "Removing duplicate backend/backend directory..."
    rm -rf backend/backend
fi

# Remove node_modules (customer should install fresh)
echo "Removing node_modules (customer will install fresh)..."
rm -rf node_modules
rm -rf backend/node_modules

# Remove build outputs
echo "Removing build outputs..."
rm -rf dist
rm -rf backend/dist

# Create .gitignore if it doesn't exist
if [ ! -f .gitignore ]; then
    echo "Creating .gitignore..."
    cat > .gitignore << 'GITIGNORE'
# Dependencies
node_modules/

# Build output
dist/

# Environment variables - NEVER commit these!
.env
.env.*
!.env.example

# Deployment outputs - contain secrets
deployment-output.json
deployment-info.txt
app-registration.json
*.zip

# Temporary and backup files
*.bak
*.tmp
*.swp
*.swo
*~

# Logs
logs/
*.log
npm-debug.log*
yarn-debug.log*
yarn-error.log*

# OS files
.DS_Store
Thumbs.db

# IDE
.vscode/
.idea/

# Testing
coverage/

# Misc
.cache/
.temp/

# Documentation that contains deployment-specific info
*_SUMMARY.md
*_STATUS.md
*_COMPLETE.md
*_TRACKING.md
DEPLOYMENT_INFO.txt
PROJECT_STATUS.md
GITIGNORE
fi

# Verify critical files exist
echo -e "\n${GREEN}Verifying required files exist...${NC}"
MISSING=0

for file in README.md DEPLOYMENT.md .env.example deploy.sh infrastructure/main.bicep; do
    if [ ! -f "$file" ] && [ ! -d "$file" ]; then
        echo -e "${RED}✗ Missing: $file${NC}"
        MISSING=1
    else
        echo -e "${GREEN}✓ Found: $file${NC}"
    fi
done

if [ $MISSING -eq 1 ]; then
    echo -e "\n${RED}Warning: Some required files are missing!${NC}"
fi

echo -e "\n${GREEN}=== Package Preparation Complete! ===${NC}\n"
echo "The solution is now ready for customer distribution."
echo ""
echo "Recommended next steps:"
echo "1. Test a clean deployment"
echo "2. Create a release tag in git"
echo "3. Package as ZIP or push to customer GitHub repo"
echo ""
echo "To package as ZIP:"
echo "  zip -r cps230-solution-v1.0.0.zip . -x '*.git*' -x 'node_modules/*' -x 'dist/*'"
