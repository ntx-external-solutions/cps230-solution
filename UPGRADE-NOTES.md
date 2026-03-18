# CPS230 Solution - Upgrade Notes

## Latest Update: March 18, 2026

### What's New

#### 1. Controls Many-to-Many Relationships
**Breaking Change:** Controls can now have multiple critical operations, processes, and systems instead of just one.

- **Database Changes:**
  - New junction tables: `control_critical_operations`, `control_processes`, `control_systems`
  - Migration 009 automatically migrates existing single relationships to junction tables
  - Old single foreign key columns remain for backward compatibility but are deprecated

- **UI Changes:**
  - Control dialog now uses multi-select dropdowns (similar to Critical Operations)
  - Multiple items can be selected for critical operations, processes, and systems
  - Badge-style display of selected items

- **API Changes:**
  - New endpoints:
    - `/api/control-critical-operations` - Manage control-critical operation relationships
    - `/api/control-processes` - Manage control-process relationships
    - `/api/control-systems` - Manage control-system relationships
  - `GET /api/controls` now returns arrays of related entities instead of single items
  - Response format change:
    ```json
    {
      "critical_operations": [{"id": "...", "operation_name": "..."}],
      "processes": [{"id": "...", "process_name": "..."}],
      "systems": [{"id": "...", "system_name": "..."}]
    }
    ```

#### 2. Region Selector Improvements
- Process and Control dialogs now pull regions from the database instead of hardcoded values
- Regions are dynamically loaded from the `regions` table
- Consistent region display with icons across all dialogs

#### 3. Node.js 24 Upgrade
**Important:** This update upgrades from Node.js 20 to Node.js 24 (Node.js 20 reaches end-of-life on April 29, 2026)

- **Backend:**
  - Updated `package.json` to require Node.js 24+
  - Updated `@types/node` to v24
  - Azure Function App configured to use Node.js 24 runtime

- **What You Need to Do:**
  - No action required if using the automatic `customer-update.sh` script
  - If deploying manually, ensure your local Node.js is v24+ (`node --version`)

#### 4. Automated Update Script
New `customer-update.sh` script for easy updates:

**Features:**
- Automatically pulls latest code from git (if repository configured)
- Applies all pending database migrations
- Tracks applied migrations to prevent duplicates
- Rebuilds and redeploys backend
- Rebuilds and redeploys frontend
- No manual steps required

**Usage:**
```bash
./customer-update.sh
```

The script will:
1. Detect your deployment from `deployment-info.txt`
2. Pull latest code changes (if git repository)
3. Retrieve database credentials from Azure
4. Apply new migrations automatically
5. Build and deploy backend
6. Build and deploy frontend

### Migration Guide

#### For Existing Deployments

**Option 1: Automatic Update (Recommended)**
```bash
# Run the automated update script
./customer-update.sh
```

**Option 2: Manual Update**
```bash
# 1. Pull latest code
git pull

# 2. Apply database migration
./database/apply-migration-009.sh

# 3. Update and deploy backend
cd backend
npm install
npm run build
func azure functionapp publish <your-function-app-name> --typescript
cd ..

# 4. Update and deploy frontend
npm install --legacy-peer-deps
npm run build
npx @azure/static-web-apps-cli deploy ./dist \
    --deployment-token "<your-token>" \
    --env production
```

#### Database Migration Details

Migration 009 creates the following tables:
- `control_critical_operations` - Links controls to multiple critical operations
- `control_processes` - Links controls to multiple processes
- `control_systems` - Links controls to multiple systems

**Data Migration:**
- Existing single relationships are automatically copied to junction tables
- Old foreign key columns remain for backward compatibility
- No data loss occurs during migration

**Rollback:**
If you need to rollback, the original single foreign key columns still exist and contain the first related item from each category.

### Testing After Update

After updating, test the following:

1. **Controls Management:**
   - [ ] Create a new control with multiple critical operations
   - [ ] Create a new control with multiple processes
   - [ ] Create a new control with multiple systems
   - [ ] Edit an existing control and verify relationships load correctly
   - [ ] Verify existing controls display their relationships

2. **Region Selectors:**
   - [ ] Add/edit a process and verify regions load from database
   - [ ] Add/edit a control and verify regions load from database
   - [ ] Verify region icons display correctly

3. **Authentication:**
   - [ ] Test local login
   - [ ] Test Azure AD login (if configured)

4. **General Functionality:**
   - [ ] Test Process Manager sync
   - [ ] Test dashboard filters
   - [ ] Test BPMN canvas rendering

### Breaking Changes

#### API Response Format
The `GET /api/controls` endpoint now returns arrays instead of single items:

**Before:**
```json
{
  "id": "...",
  "critical_operation_id": "123",
  "critical_operation_name": "Operation 1",
  "process_id": "456",
  "process_name": "Process 1"
}
```

**After:**
```json
{
  "id": "...",
  "critical_operations": [
    {"id": "123", "operation_name": "Operation 1"},
    {"id": "789", "operation_name": "Operation 2"}
  ],
  "processes": [
    {"id": "456", "process_name": "Process 1"}
  ],
  // Backward compatibility fields (first item only):
  "critical_operation_name": "Operation 1",
  "process_name": "Process 1"
}
```

**Impact:** If you have custom integrations consuming the controls API, update them to handle arrays.

### Known Issues

None at this time.

### Support

If you encounter issues during or after the upgrade:

1. Check the browser console for errors (F12 → Console)
2. Check Azure Function App logs in the Azure Portal
3. Verify database migration completed successfully:
   ```sql
   SELECT * FROM schema_migrations WHERE version = '009_add_control_many_to_many';
   ```
4. Report issues at: https://github.com/anthropics/cps230-solution/issues

### Rollback Procedure

If you need to rollback this update:

1. **Database:** The migration is backward compatible - original foreign key columns still exist
2. **Code:** Use git to revert to the previous version:
   ```bash
   git log  # Find the commit before the update
   git checkout <previous-commit-hash>
   ./customer-update.sh  # Redeploy the previous version
   ```
3. **Azure Function App:** If needed, change back to Node 20:
   ```bash
   az functionapp config appsettings set \
       --name <function-app-name> \
       --resource-group <resource-group> \
       --settings WEBSITE_NODE_DEFAULT_VERSION="~20"
   ```

### Future Updates

With the new `customer-update.sh` script, future updates will be as simple as:
```bash
./customer-update.sh
```

The script automatically:
- Pulls the latest code
- Applies new database migrations
- Rebuilds and redeploys everything

This ensures you always get the latest features, bug fixes, and security updates with minimal effort.
