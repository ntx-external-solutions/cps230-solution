import {
  app,
  HttpRequest,
  HttpResponseInit,
  InvocationContext,
} from '@azure/functions';
import {
  authenticateRequest,
  getCorsHeaders,
  getUserProfile,
  hasRole,
} from '../shared/auth';
import { query, setSessionContext, getPool } from '../shared/database';
import { ValidationError } from '../shared/validation';

/**
 * Sync Process Manager HTTP trigger function
 * Handles synchronization with Nintex Process Manager
 */
export async function syncProcessManagerFunction(
  request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  const origin = request.headers.get('origin');
  const corsHeaders = getCorsHeaders(origin);

  // Handle CORS preflight
  if (request.method === 'OPTIONS') {
    return {
      status: 204,
      headers: corsHeaders,
    };
  }

  try {
    // Authenticate user
    const decodedToken = await authenticateRequest(request);
    const userProfile = await getUserProfile(decodedToken);

    // Set session context for RLS
    const pool = getPool();
    await setSessionContext(pool, userProfile.azureAdObjectId, userProfile.role);

    // Only promasters can trigger sync
    if (!hasRole(userProfile.role, ['promaster'])) {
      return {
        status: 403,
        headers: corsHeaders,
        jsonBody: { error: 'Insufficient permissions. Only Promasters can sync with Nintex Process Manager.' },
      };
    }

    const url = new URL(request.url);
    const syncType = url.searchParams.get('type') || 'full';

    switch (request.method) {
      case 'POST':
        return await handleSync(syncType, userProfile, corsHeaders, context);

      case 'GET':
        return await handleStatus(corsHeaders, context);

      default:
        return {
          status: 405,
          headers: corsHeaders,
          jsonBody: { error: 'Method not allowed' },
        };
    }
  } catch (error: any) {
    context.error('Error in sync-process-manager function:', error);

    const status = error instanceof ValidationError
      ? 400
      : error.message?.includes('Token')
      ? 401
      : error.message?.includes('permission') || error.message?.includes('role')
      ? 403
      : 500;

    return {
      status,
      headers: corsHeaders,
      jsonBody: {
        error: error.message || 'An error occurred',
      },
    };
  }
}

/**
 * Handle GET request - Get sync status and last sync info
 */
async function handleStatus(
  corsHeaders: Record<string, string>,
  context: InvocationContext
): Promise<HttpResponseInit> {
  // Get last sync timestamp from settings
  const lastSyncResult = await query(
    "SELECT value FROM settings WHERE key = 'last_sync_timestamp'"
  );

  // Get recent sync history
  const historyResult = await query(
    'SELECT * FROM sync_history ORDER BY started_at DESC LIMIT 10'
  );

  return {
    status: 200,
    headers: corsHeaders,
    jsonBody: {
      data: {
        lastSync: lastSyncResult.rows.length > 0 ? lastSyncResult.rows[0].value : null,
        recentHistory: historyResult.rows,
      },
    },
  };
}

/**
 * Handle POST request - Trigger sync with Nintex Process Manager
 */
async function handleSync(
  syncType: string,
  userProfile: any,
  corsHeaders: Record<string, string>,
  context: InvocationContext
): Promise<HttpResponseInit> {
  // Validate sync type
  const validSyncTypes = ['full', 'incremental', 'processes', 'systems'];
  if (!validSyncTypes.includes(syncType)) {
    return {
      status: 400,
      headers: corsHeaders,
      jsonBody: { error: 'Invalid sync type. Must be one of: full, incremental, processes, systems' },
    };
  }

  // Create sync history record
  const historyResult = await query(
    `INSERT INTO sync_history (
      sync_type, status, initiated_by
    ) VALUES ($1, $2, $3)
    RETURNING id`,
    [syncType, 'in_progress', userProfile.email]
  );

  const syncHistoryId = historyResult.rows[0].id;

  try {
    // Get Nintex API credentials from settings
    const credentialsResult = await query(
      "SELECT value FROM settings WHERE key = 'nintex_api_url'"
    );

    if (credentialsResult.rows.length === 0) {
      throw new Error('Nintex API URL not configured in settings');
    }

    const apiUrl = JSON.parse(credentialsResult.rows[0].value);

    if (!apiUrl || apiUrl === '') {
      // API not configured, return stub response
      await query(
        `UPDATE sync_history SET
          status = $1,
          error_message = $2,
          completed_at = NOW()
        WHERE id = $3`,
        ['failed', 'Nintex API URL not configured. Please configure in Settings.', syncHistoryId]
      );

      return {
        status: 200,
        headers: corsHeaders,
        jsonBody: {
          message: 'Sync initiated but Nintex API is not configured',
          syncHistoryId,
          status: 'failed',
          error: 'Nintex API URL not configured. Please configure in Settings.',
        },
      };
    }

    // TODO: Implement actual Nintex API integration
    // For now, return a placeholder response
    await query(
      `UPDATE sync_history SET
        status = $1,
        records_synced = $2,
        error_message = $3,
        completed_at = NOW()
      WHERE id = $4`,
      ['success', 0, 'Nintex API integration pending implementation', syncHistoryId]
    );

    // Update last sync timestamp
    await query(
      `UPDATE settings SET
        value = $1,
        modified_by = $2,
        modified_date = NOW()
      WHERE key = 'last_sync_timestamp'`,
      [JSON.stringify(new Date().toISOString()), userProfile.email]
    );

    return {
      status: 200,
      headers: corsHeaders,
      jsonBody: {
        message: 'Sync completed (Nintex integration pending)',
        syncHistoryId,
        status: 'success',
        recordsSynced: 0,
        note: 'This is a placeholder. Actual Nintex API integration needs to be implemented.',
      },
    };
  } catch (error: any) {
    context.error('Sync error:', error);

    // Update sync history with error
    await query(
      `UPDATE sync_history SET
        status = $1,
        error_message = $2,
        completed_at = NOW()
      WHERE id = $3`,
      ['failed', error.message, syncHistoryId]
    );

    return {
      status: 500,
      headers: corsHeaders,
      jsonBody: {
        error: 'Sync failed',
        message: error.message,
        syncHistoryId,
      },
    };
  }
}

// Register the function
app.http('sync-process-manager', {
  methods: ['GET', 'POST', 'OPTIONS'],
  authLevel: 'anonymous',
  handler: syncProcessManagerFunction,
});
