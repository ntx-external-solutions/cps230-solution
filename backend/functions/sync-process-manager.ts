import {
  app,
  HttpRequest,
  HttpResponseInit,
  InvocationContext,
} from '@azure/functions';
import {
  authenticateRequestUnified,
  getCorsHeaders,
  hasRole,
} from '../shared/auth';
import { query, setSessionContext, getClient } from '../shared/database';
import { ValidationError } from '../shared/validation';
import { PoolClient } from 'pg';

/**
 * Maps regional site URLs to their corresponding search service endpoints
 */
function getSearchEndpoint(siteUrl: string): string {
  const regionMap: Record<string, string> = {
    'demo.promapp.com': 'dmo-wus-sch.promapp.io',
    'us.promapp.com': 'prd-wus-sch.promapp.io',
    'ca.promapp.com': 'prd-cac-sch.promapp.io',
    'eu.promapp.com': 'prd-neu-sch.promapp.io',
    'au.promapp.com': 'prd-aus-sch.promapp.io',
  };

  return regionMap[siteUrl] || 'prd-wus-sch.promapp.io';
}

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

  let client: PoolClient | null = null;

  try {
    // Authenticate user
    const userProfile = await authenticateRequestUnified(request);

    // Get a dedicated client from the pool for this request
    client = await getClient();

    // Set session context for RLS on this specific client
    await setSessionContext(client, userProfile.id, userProfile.azureAdObjectId, userProfile.role);

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
        return await handleSync(syncType, userProfile, corsHeaders, context, client);

      case 'GET':
        return await handleStatus(corsHeaders, context, client);

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
      : error.message?.includes('Token') || error.message?.includes('Authorization') || error.message?.includes('Authentication')
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
  } finally {
    // Always release the client back to the pool
    if (client) {
      client.release();
    }
  }
}

/**
 * Handle GET request - Get sync status and last sync info
 */
async function handleStatus(
  corsHeaders: Record<string, string>,
  context: InvocationContext,
  client: PoolClient
): Promise<HttpResponseInit> {
  // Get last sync timestamp from settings
  const lastSyncResult = await client.query(
    "SELECT value FROM settings WHERE key = 'last_sync_timestamp'"
  );

  // Get recent sync history
  const historyResult = await client.query(
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
  context: InvocationContext,
  client: PoolClient
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
  const historyResult = await client.query(
    `INSERT INTO sync_history (
      sync_type, status, initiated_by
    ) VALUES ($1, $2, $3)
    RETURNING id`,
    [syncType, 'in_progress', userProfile.email]
  );

  const syncHistoryId = historyResult.rows[0].id;

  try {
    // Get Process Manager configuration from settings
    const siteUrlResult = await client.query(
      "SELECT value FROM settings WHERE key = 'pm_site_url'"
    );
    const usernameResult = await client.query(
      "SELECT value FROM settings WHERE key = 'pm_username'"
    );
    const passwordResult = await client.query(
      "SELECT value FROM settings WHERE key = 'pm_password'"
    );
    const tenantIdResult = await client.query(
      "SELECT value FROM settings WHERE key = 'pm_tenant_id'"
    );

    // JSONB values are automatically parsed by PostgreSQL, no need for JSON.parse
    const siteUrl = siteUrlResult.rows[0]?.value || '';
    const username = usernameResult.rows[0]?.value || '';
    const password = passwordResult.rows[0]?.value || '';
    const tenantId = tenantIdResult.rows[0]?.value || '';

    // Check if Process Manager is configured
    if (!siteUrl || !username || !password || !tenantId) {
      await client.query(
        `UPDATE sync_history SET
          status = $1,
          error_message = $2,
          completed_at = NOW()
        WHERE id = $3`,
        ['failed', 'Process Manager connection not fully configured. Please provide site URL, username, password, and tenant ID in Settings.', syncHistoryId]
      );

      return {
        status: 200,
        headers: corsHeaders,
        jsonBody: {
          message: 'Sync initiated but Process Manager is not configured',
          syncHistoryId,
          status: 'failed',
          error: 'Process Manager connection not fully configured. Please provide all credentials in Settings.',
        },
      };
    }

    context.log('Process Manager credentials configured:', {
      siteUrl,
      username,
      tenantId,
      hasPassword: !!password,
    });

    // Step 1: Authenticate with Process Manager using OAuth2
    // Construct full URL: regional domain + site identifier
    const fullSiteUrl = `${siteUrl}/${tenantId}`;
    const tokenUrl = `https://${fullSiteUrl}/oauth2/token`;
    const authBody = new URLSearchParams({
      grant_type: 'password',
      username: username,
      password: password,
      duration: '60000', // Token duration in milliseconds
    });

    context.log('Authenticating with Process Manager...');
    const tokenResponse = await fetch(tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: authBody.toString(),
    });

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text();
      throw new Error(`Process Manager authentication failed: ${tokenResponse.status} ${tokenResponse.statusText} - ${errorText}`);
    }

    const tokenData = await tokenResponse.json() as any;
    const accessToken = tokenData.access_token;

    if (!accessToken) {
      throw new Error('No access token received from Process Manager');
    }

    context.log('Successfully authenticated with Process Manager');

    // Step 2: Get search service token
    const searchTokenUrl = `https://${fullSiteUrl}/search/GetSearchServiceToken`;
    context.log('Getting search service token...');
    const searchTokenResponse = await fetch(searchTokenUrl, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
      },
    });

    if (!searchTokenResponse.ok) {
      const errorText = await searchTokenResponse.text();
      throw new Error(`Failed to get search token: ${searchTokenResponse.status} ${searchTokenResponse.statusText} - ${errorText}`);
    }

    const searchToken = await searchTokenResponse.text(); // Returns plain text token
    context.log('Successfully obtained search service token');

    // Step 3: Map site URL to search endpoint
    const searchEndpoint = getSearchEndpoint(siteUrl);
    context.log(`Using search endpoint: ${searchEndpoint}`);

    // Step 4: Search for processes tagged with #CPS230
    const searchUrl = `https://${searchEndpoint}/fullsearch`;
    const searchParams = new URLSearchParams({
      SearchCriteria: '#CPS230',
      IncludedTypes: '1', // 1 = processes
      SearchMatchType: '0',
      pageNumber: '1',
      PageSize: '100',
    });

    context.log('Searching for #CPS230 tagged processes...');
    const searchResponse = await fetch(`${searchUrl}?${searchParams}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${searchToken}`,
      },
    });

    if (!searchResponse.ok) {
      const errorText = await searchResponse.text();
      throw new Error(`Process search failed: ${searchResponse.status} ${searchResponse.statusText} - ${errorText}`);
    }

    const searchData = await searchResponse.json() as any;

    // Extract process unique IDs from search results
    const allHighlights = searchData?.response || [];
    const processUniqueIds = allHighlights
      .filter((result: any) => result.highlightedResult?.toLowerCase().includes('cps230'))
      .map((result: any) => result.id);

    context.log(`Found ${processUniqueIds.length} processes with #CPS230 tag`);

    if (processUniqueIds.length === 0) {
      await client.query(
        `UPDATE sync_history SET
          status = $1,
          records_synced = $2,
          error_message = $3,
          completed_at = NOW()
        WHERE id = $4`,
        ['success', 0, 'No CPS230 tagged processes found in Process Manager', syncHistoryId]
      );

      return {
        status: 200,
        headers: corsHeaders,
        jsonBody: {
          message: 'No CPS230 tagged processes found in Process Manager site.',
          syncHistoryId,
          status: 'success',
          recordsSynced: 0,
        },
      };
    }

    // Step 6: Fetch detailed process data for each unique ID and store in database
    let recordsSynced = 0;
    const errors: string[] = [];

    for (const processUniqueId of processUniqueIds) {
      try {
        // Fetch detailed process data using the site token (not search token)
        const processUrl = `https://${fullSiteUrl}/api/process/${processUniqueId}`;
        context.log(`Fetching process details for ${processUniqueId}...`);
        const processResponse = await fetch(processUrl, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
        });

        if (!processResponse.ok) {
          const errorText = await processResponse.text();
          context.error(`Failed to fetch process ${processUniqueId}: ${processResponse.status} - ${errorText}`);
          errors.push(`Process ${processUniqueId}: ${processResponse.statusText}`);
          continue;
        }

        const processData = await processResponse.json() as any;

        // Extract tags from process data
        const tags = processData.tags || processData.tagList || [];
        const tagArray = Array.isArray(tags) ? tags : [];

        // Check if #CPS230 tag exists
        const isCPS230Tagged = tagArray.some((tag: string) =>
          tag && tag.toLowerCase().includes('cps230')
        );

        // Extract process expert
        const processExpert = processData.expertName || processData.processExpert ||
                             processData.expert || null;

        // Extract process status
        const processStatus = processData.status || processData.publishState || null;

        // Extract full owner and expert objects if available
        const ownerData = processData.owner || null;
        const expertData = processData.expertData || processData.expert || null;

        // Extract process metadata (inputs, outputs, triggers, targets)
        const processJson = processData.processJson || processData;

        const inputs = processJson.Inputs?.Input || null;
        const outputs = processJson.Outputs?.Output || null;
        const triggers = processJson.Triggers?.Trigger || null;
        const targets = processJson.Targets?.Target || null;

        // Upsert process to database
        await client.query(
          `INSERT INTO processes (
            process_name,
            process_unique_id,
            owner_username,
            process_expert,
            process_status,
            process_owner_data,
            process_expert_data,
            metadata,
            is_cps230_tagged,
            tags,
            inputs,
            outputs,
            triggers,
            targets,
            modified_by
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
          ON CONFLICT (process_unique_id)
          DO UPDATE SET
            process_name = EXCLUDED.process_name,
            owner_username = EXCLUDED.owner_username,
            process_expert = EXCLUDED.process_expert,
            process_status = EXCLUDED.process_status,
            process_owner_data = EXCLUDED.process_owner_data,
            process_expert_data = EXCLUDED.process_expert_data,
            metadata = EXCLUDED.metadata,
            is_cps230_tagged = EXCLUDED.is_cps230_tagged,
            tags = EXCLUDED.tags,
            inputs = EXCLUDED.inputs,
            outputs = EXCLUDED.outputs,
            triggers = EXCLUDED.triggers,
            targets = EXCLUDED.targets,
            modified_by = EXCLUDED.modified_by,
            modified_date = NOW()
          `,
          [
            processData.name,
            processUniqueId,
            processData.ownerName || null,
            processExpert,
            processStatus,
            ownerData ? JSON.stringify(ownerData) : null,
            expertData ? JSON.stringify(expertData) : null,
            JSON.stringify({
              referenceNo: processData.referenceNo,
              processGroup: processData.processGroupName,
              version: processData.version,
              publishState: processData.publishState,
            }),
            isCPS230Tagged,
            tagArray,
            inputs ? JSON.stringify(inputs) : null,
            outputs ? JSON.stringify(outputs) : null,
            triggers ? JSON.stringify(triggers) : null,
            targets ? JSON.stringify(targets) : null,
            userProfile.email,
          ]
        );

        context.log(`Successfully synced process: ${processData.name}`);
        recordsSynced++;
      } catch (error: any) {
        context.error(`Error processing process ${processUniqueId}:`, error);
        errors.push(`${processUniqueId}: ${error.message}`);
      }
    }

    // Update sync history with results
    await client.query(
      `UPDATE sync_history SET
        status = $1,
        records_synced = $2,
        error_message = $3,
        completed_at = NOW()
      WHERE id = $4`,
      [
        recordsSynced > 0 ? 'success' : 'failed',
        recordsSynced,
        errors.length > 0 ? errors.join('; ') : null,
        syncHistoryId
      ]
    );

    // Update last sync timestamp
    await client.query(
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
        message: `Successfully synced ${recordsSynced} processes from Process Manager`,
        syncHistoryId,
        status: 'success',
        recordsSynced,
        totalFound: processUniqueIds.length,
        errors: errors.length > 0 ? errors : undefined,
      },
    };
  } catch (error: any) {
    context.error('Sync error:', error);

    // Update sync history with error
    await client.query(
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
