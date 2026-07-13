#!/bin/bash
# Database initialization script for CPS230 Solution
# This script applies the schema to a new Azure PostgreSQL Flexible Server

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to print colored output
print_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

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

print_info "Starting database initialization..."
print_info "Database: $POSTGRES_DB on $POSTGRES_HOST"

# Set PostgreSQL password for psql
export PGPASSWORD="$POSTGRES_PASSWORD"

# Test connection
print_info "Testing database connection..."
if ! psql -h "$POSTGRES_HOST" -U "$POSTGRES_USER" -d postgres -c "SELECT 1;" > /dev/null 2>&1; then
    print_error "Failed to connect to PostgreSQL server"
    exit 1
fi
print_info "Connection successful"

# Check if database exists, create if not
print_info "Checking if database exists..."
DB_EXISTS=$(psql -h "$POSTGRES_HOST" -U "$POSTGRES_USER" -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname='$POSTGRES_DB'")

if [ "$DB_EXISTS" != "1" ]; then
    print_info "Creating database: $POSTGRES_DB"
    psql -h "$POSTGRES_HOST" -U "$POSTGRES_USER" -d postgres -c "CREATE DATABASE $POSTGRES_DB;"
else
    print_info "Database already exists"
fi

# Apply schema
print_info "Applying database schema..."
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if [ ! -f "$SCRIPT_DIR/schema.sql" ]; then
    print_error "schema.sql not found in $SCRIPT_DIR"
    exit 1
fi

if psql -h "$POSTGRES_HOST" -U "$POSTGRES_USER" -d "$POSTGRES_DB" -f "$SCRIPT_DIR/schema.sql"; then
    print_info "Schema applied successfully"
else
    print_error "Failed to apply schema"
    exit 1
fi

# Run migrations if any exist.
#
# We also RECORD each applied migration in a schema_migrations table. Without
# this, customer-update.sh (which tracks migrations) sees an untracked database
# on the first upgrade and re-applies every migration. The migrations are written
# idempotently so that is harmless today, but recording them here keeps upgrades
# clean and fast, and protects against any future non-idempotent migration.
if [ -d "$SCRIPT_DIR/migrations" ] && [ "$(ls -A $SCRIPT_DIR/migrations/*.sql 2>/dev/null)" ]; then
    print_info "Applying migrations..."

    # Ensure the tracking table exists (same shape customer-update.sh expects).
    psql -h "$POSTGRES_HOST" -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "
        CREATE TABLE IF NOT EXISTS public.schema_migrations (
            version VARCHAR(255) PRIMARY KEY,
            applied_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        );" > /dev/null

    for migration in "$SCRIPT_DIR/migrations"/*.sql; do
        if [ -f "$migration" ]; then
            MIGRATION_NAME=$(basename "$migration" .sql)
            print_info "Applying migration: $MIGRATION_NAME"
            # ON_ERROR_STOP=1 so a real SQL error fails the migration instead of
            # being silently swallowed (psql otherwise returns 0 despite errors).
            # Safe because the migrations are idempotent.
            if psql -v ON_ERROR_STOP=1 -h "$POSTGRES_HOST" -U "$POSTGRES_USER" -d "$POSTGRES_DB" -f "$migration"; then
                # Record it (idempotent: ON CONFLICT DO NOTHING).
                psql -h "$POSTGRES_HOST" -U "$POSTGRES_USER" -d "$POSTGRES_DB" \
                    -c "INSERT INTO public.schema_migrations (version) VALUES ('$MIGRATION_NAME') ON CONFLICT (version) DO NOTHING;" > /dev/null
                print_info "Migration applied: $MIGRATION_NAME"
            else
                print_error "Failed to apply migration: $MIGRATION_NAME"
                exit 1
            fi
        fi
    done
else
    print_info "No migrations to apply"
fi

# Verify tables were created
print_info "Verifying table creation..."
TABLE_COUNT=$(psql -h "$POSTGRES_HOST" -U "$POSTGRES_USER" -d "$POSTGRES_DB" -tAc "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE';")

if [ "$TABLE_COUNT" -gt 0 ]; then
    print_info "Database initialized successfully! $TABLE_COUNT tables created."
else
    print_error "No tables were created. Database initialization may have failed."
    exit 1
fi

# Clean up
unset PGPASSWORD

print_info "Database initialization complete!"
