#!/bin/bash
# Script to apply migration 009 - Add control many-to-many relationships
set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
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

# Load environment variables from .env if it exists
if [ -f "$(dirname "$0")/../.env" ]; then
    print_info "Loading environment variables from .env file..."
    export $(cat "$(dirname "$0")/../.env" | grep -v '^#' | xargs)
fi

# Check for required environment variables
if [ -z "$POSTGRES_HOST" ]; then
    print_error "POSTGRES_HOST environment variable is required"
    exit 1
fi

if [ -z "$POSTGRES_DB" ]; then
    print_error "POSTGRES_DB environment variable is required"
    exit 1
fi

if [ -z "$POSTGRES_USER" ]; then
    print_error "POSTGRES_USER environment variable is required"
    exit 1
fi

if [ -z "$POSTGRES_PASSWORD" ]; then
    print_error "POSTGRES_PASSWORD environment variable is required"
    exit 1
fi

print_info "Applying migration 009 to database: $POSTGRES_DB on $POSTGRES_HOST"

# Set PostgreSQL password for psql
export PGPASSWORD="$POSTGRES_PASSWORD"

# Get script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MIGRATION_FILE="$SCRIPT_DIR/migrations/009_add_control_many_to_many.sql"

# Check if migration file exists
if [ ! -f "$MIGRATION_FILE" ]; then
    print_error "Migration file not found: $MIGRATION_FILE"
    exit 1
fi

# Test connection
print_info "Testing database connection..."
if ! psql -h "$POSTGRES_HOST" -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "SELECT 1;" > /dev/null 2>&1; then
    print_error "Failed to connect to PostgreSQL server"
    exit 1
fi
print_info "Connection successful"

# Apply migration
print_info "Applying migration 009_add_control_many_to_many.sql..."
if psql -h "$POSTGRES_HOST" -U "$POSTGRES_USER" -d "$POSTGRES_DB" -f "$MIGRATION_FILE"; then
    print_info "Migration 009 applied successfully!"
else
    print_error "Failed to apply migration 009"
    exit 1
fi

# Verify tables were created
print_info "Verifying junction tables were created..."
TABLE_CHECK=$(psql -h "$POSTGRES_HOST" -U "$POSTGRES_USER" -d "$POSTGRES_DB" -tAc "
    SELECT COUNT(*) FROM information_schema.tables
    WHERE table_schema='public'
    AND table_name IN ('control_critical_operations', 'control_processes', 'control_systems');
")

if [ "$TABLE_CHECK" -eq "3" ]; then
    print_info "All 3 junction tables created successfully!"
else
    print_warning "Expected 3 junction tables, found $TABLE_CHECK"
fi

# Clean up
unset PGPASSWORD

print_info "Migration 009 complete!"
