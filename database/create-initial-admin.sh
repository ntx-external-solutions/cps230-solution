#!/bin/bash
# Create Initial Admin User
# This script creates the first admin user during deployment

set -e

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m'

# Check required environment variables
if [ -z "$POSTGRES_HOST" ] || [ -z "$POSTGRES_DB" ] || [ -z "$POSTGRES_USER" ] || [ -z "$POSTGRES_PASSWORD" ]; then
    echo -e "${RED}[ERROR]${NC} Required environment variables not set"
    echo "Required: POSTGRES_HOST, POSTGRES_DB, POSTGRES_USER, POSTGRES_PASSWORD"
    echo "Optional: ADMIN_EMAIL, ADMIN_PASSWORD, ADMIN_FULL_NAME"
    exit 1
fi

# Default admin credentials (can be overridden by environment variables)
ADMIN_EMAIL="${ADMIN_EMAIL:-admin@example.com}"
ADMIN_PASSWORD="${ADMIN_PASSWORD:-ChangeMe123!}"
ADMIN_FULL_NAME="${ADMIN_FULL_NAME:-System Administrator}"

echo -e "${GREEN}[INFO]${NC} Creating initial admin user..."
echo -e "${GREEN}[INFO]${NC} Email: $ADMIN_EMAIL"

# Check if any users exist
USER_COUNT=$(PGPASSWORD="$POSTGRES_PASSWORD" psql \
    "postgresql://$POSTGRES_USER@$POSTGRES_HOST:5432/$POSTGRES_DB?sslmode=require" \
    -t -c "SELECT COUNT(*) FROM user_profiles;" | xargs)

if [ "$USER_COUNT" -gt 0 ]; then
    echo -e "${GREEN}[INFO]${NC} Users already exist. Skipping initial admin creation."
    exit 0
fi

# Generate password hash using Node.js and bcryptjs
echo -e "${GREEN}[INFO]${NC} Generating password hash..."

# Navigate to backend directory
cd "$(dirname "$0")/../backend"

# Generate hash
PASSWORD_HASH=$(node -e "
const bcrypt = require('bcryptjs');
bcrypt.hash('$ADMIN_PASSWORD', 12, (err, hash) => {
  if (err) {
    console.error('Error:', err);
    process.exit(1);
  }
  console.log(hash);
});
")

if [ -z "$PASSWORD_HASH" ]; then
    echo -e "${RED}[ERROR]${NC} Failed to generate password hash"
    exit 1
fi

# Create the admin user
echo -e "${GREEN}[INFO]${NC} Inserting admin user into database..."

PGPASSWORD="$POSTGRES_PASSWORD" psql \
    "postgresql://$POSTGRES_USER@$POSTGRES_HOST:5432/$POSTGRES_DB?sslmode=require" \
    -c "INSERT INTO user_profiles (email, full_name, role, password_hash, auth_type) 
        VALUES ('$ADMIN_EMAIL', '$ADMIN_FULL_NAME', 'promaster', '$PASSWORD_HASH', 'local')
        ON CONFLICT (email) DO NOTHING;" > /dev/null

if [ $? -eq 0 ]; then
    echo -e "${GREEN}[INFO]${NC} ✓ Initial admin user created successfully!"
    echo -e "${GREEN}[INFO]${NC}"
    echo -e "${GREEN}[INFO]${NC} ═══════════════════════════════════════"
    echo -e "${GREEN}[INFO]${NC}   INITIAL ADMIN CREDENTIALS"
    echo -e "${GREEN}[INFO]${NC} ═══════════════════════════════════════"
    echo -e "${GREEN}[INFO]${NC}   Email:    $ADMIN_EMAIL"
    echo -e "${GREEN}[INFO]${NC}   Password: $ADMIN_PASSWORD"
    echo -e "${GREEN}[INFO]${NC}   Role:     promaster (admin)"
    echo -e "${GREEN}[INFO]${NC} ═══════════════════════════════════════"
    echo -e "${GREEN}[INFO]${NC}"
    echo -e "${GREEN}[INFO]${NC} ⚠️  IMPORTANT: Change this password after first login!"
else
    echo -e "${RED}[ERROR]${NC} Failed to create admin user"
    exit 1
fi
