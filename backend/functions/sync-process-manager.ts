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

    const syncScopeResult = await client.query(
      "SELECT value FROM settings WHERE key = 'sync_scope'"
    );

    // JSONB values are automatically parsed by PostgreSQL, no need for JSON.parse
    const siteUrl = siteUrlResult.rows[0]?.value || '';
    const username = usernameResult.rows[0]?.value || '';
    const password = passwordResult.rows[0]?.value || '';
    const tenantId = tenantIdResult.rows[0]?.value || '';
    const syncScope = syncScopeResult.rows[0]?.value || 'cps230_only';

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
    context.log(`Constructed fullSiteUrl: ${fullSiteUrl} (siteUrl: ${siteUrl}, tenantId: ${tenantId})`);
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

    // Step 2-4: Discover processes based on sync scope
    let processUniqueIds: string[] = [];

    if (syncScope === 'all_processes') {
      // Fetch ALL processes using the BFF Process List API
      context.log('Sync scope: all_processes - Fetching all processes from BFF API');
      const pageSize = 100;
      let page = 1;
      let totalItemCount = 0;

      // Fetch first page to get totalItemCount
      const listUrl = `https://${fullSiteUrl}/Bff/Process/api/v1/processes?Page=${page}&PageSize=${pageSize}&ListType=0`;
      context.log(`Fetching process list page ${page} from: ${listUrl}`);
      const listResponse = await fetch(listUrl, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
        },
      });

      if (!listResponse.ok) {
        const errorText = await listResponse.text();
        throw new Error(`Process list API failed: ${listResponse.status} ${listResponse.statusText} - ${errorText}`);
      }

      const listData = await listResponse.json() as any;
      totalItemCount = listData.totalItemCount || 0;
      const totalPages = Math.ceil(totalItemCount / pageSize);

      context.log(`BFF API reports ${totalItemCount} total processes across ${totalPages} pages`);

      // Collect unique IDs from first page
      for (const item of (listData.items || [])) {
        if (item.processUniqueId) {
          processUniqueIds.push(item.processUniqueId);
        }
      }

      // Fetch remaining pages
      for (page = 2; page <= totalPages; page++) {
        const pageUrl = `https://${fullSiteUrl}/Bff/Process/api/v1/processes?Page=${page}&PageSize=${pageSize}&ListType=0`;
        context.log(`Fetching process list page ${page} of ${totalPages}`);
        const pageResponse = await fetch(pageUrl, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
          },
        });

        if (!pageResponse.ok) {
          context.warn(`Failed to fetch page ${page}: ${pageResponse.status}`);
          continue;
        }

        const pageData = await pageResponse.json() as any;
        for (const item of (pageData.items || [])) {
          if (item.processUniqueId) {
            processUniqueIds.push(item.processUniqueId);
          }
        }
      }

      context.log(`Collected ${processUniqueIds.length} process unique IDs from BFF API`);
    } else {
      // CPS230-only mode: Use search API (existing behavior)
      context.log('Sync scope: cps230_only - Searching for #CPS230 tagged processes');

      // Get search service token
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

      const responseText = await searchTokenResponse.text();

      // Try parsing as JSON first (search token might be in various formats)
      let searchToken: string;
      try {
        const data = JSON.parse(responseText);
        searchToken = data.Message || data.access_token || data.token || data.Token || data.AccessToken || responseText;
      } catch (e) {
        searchToken = responseText;
      }

      context.log('Successfully obtained search service token');

      // Map site URL to search endpoint
      const searchEndpoint = getSearchEndpoint(siteUrl);
      context.log(`Using search endpoint: ${searchEndpoint}`);

      // Search for processes tagged with #CPS230
      const searchUrl = `https://${searchEndpoint}/fullsearch`;
      const searchParams = new URLSearchParams({
        SearchCriteria: '#cps230',
        IncludedTypes: '1',
        SearchMatchType: '0',
        pageNumber: '1',
        PageSize: '100',
      });

      const fullSearchUrl = `${searchUrl}?${searchParams}`;
      context.log(`Searching for #CPS230 tagged processes at: ${fullSearchUrl}`);

      const searchResponse = await fetch(fullSearchUrl, {
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

      context.log(`Search API returned ${searchData.response?.length || 0} results. Success: ${searchData.success}`);

      if (!searchData.success) {
        context.error('Search API returned unsuccessful response:', searchData);
        throw new Error('Search API returned unsuccessful response');
      }

      // Filter results that have CPS230 in highlights
      const cps230Processes = (searchData.response || []).filter((result: any) => {
        const highlights = result.HighLights;
        if (!highlights) {
          return true;
        }

        const allHighlights = [
          ...(highlights.Activities || []),
          ...(highlights.Tasks || []),
          ...(highlights.LeanTags || []),
          ...(highlights.ProcessTags || []),
        ].join(' ');

        return allHighlights.includes('#CPS230') || allHighlights.includes('#cps230') || allHighlights.includes('CPS230');
      });

      // Extract unique IDs from ProcessUniqueId or ItemUrl
      processUniqueIds = cps230Processes
        .map((p: any) => {
          if (p.ProcessUniqueId) {
            return p.ProcessUniqueId;
          }
          if (p.ItemUrl) {
            const match = p.ItemUrl.match(/\/Process\/([a-f0-9-]+)/i);
            if (match && match[1]) {
              return match[1];
            }
          }
          return null;
        })
        .filter((id: any) => id) as string[];

      context.log(`Found ${processUniqueIds.length} processes with #CPS230 tag`);
    }

    if (processUniqueIds.length === 0) {
      const noProcessesMsg = syncScope === 'all_processes'
        ? 'No processes found in Process Manager site.'
        : 'No CPS230 tagged processes found in Process Manager';

      await client.query(
        `UPDATE sync_history SET
          status = $1,
          records_synced = $2,
          error_message = $3,
          completed_at = NOW()
        WHERE id = $4`,
        ['success', 0, noProcessesMsg, syncHistoryId]
      );

      return {
        status: 200,
        headers: corsHeaders,
        jsonBody: {
          message: noProcessesMsg,
          syncHistoryId,
          status: 'success',
          recordsSynced: 0,
        },
      };
    }

    // Step 6: Fetch detailed process data for each unique ID and store in database
    let recordsSynced = 0;
    const errors: string[] = [];
    const detailBatchSize = 20;
    const totalBatches = Math.ceil(processUniqueIds.length / detailBatchSize);

    // Update sync history with total process count
    await client.query(
      `UPDATE sync_history SET
        total_processes = $1,
        total_batches = $2,
        batch_size = $3
      WHERE id = $4`,
      [processUniqueIds.length, totalBatches, detailBatchSize, syncHistoryId]
    );

    for (let batchIndex = 0; batchIndex < totalBatches; batchIndex++) {
      const batchStart = batchIndex * detailBatchSize;
      const batch = processUniqueIds.slice(batchStart, batchStart + detailBatchSize);
      context.log(`Processing batch ${batchIndex + 1} of ${totalBatches} (${batch.length} processes)`);

      // Update current batch in sync history
      await client.query(
        `UPDATE sync_history SET current_batch = $1, processed_count = $2 WHERE id = $3`,
        [batchIndex + 1, batchStart, syncHistoryId]
      );

      // Fetch details concurrently within each batch
      const batchResults = await Promise.allSettled(
        batch.map(async (uid) => {
          const processUrl = `https://${fullSiteUrl}/Api/v1/Processes/${uid}`;
          const resp = await fetch(processUrl, {
            method: 'GET',
            headers: {
              'Authorization': `Bearer ${accessToken}`,
              'Content-Type': 'application/json',
            },
          });
          if (!resp.ok) {
            const errorText = await resp.text();
            throw new Error(`Process ${uid}: ${resp.status} - ${errorText}`);
          }
          return { uid, data: await resp.json() as any };
        })
      );

      // Process each result sequentially (DB writes)
      for (const result of batchResults) {
        if (result.status === 'rejected') {
          context.error(`Failed to fetch process:`, result.reason);
          errors.push(`${result.reason}`);
          continue;
        }

        const { uid: processUniqueId, data: processData } = result.value;

        try {
          // Process name and metadata are inside the processJson object
          const processJson = processData.processJson || {};

          context.log(`Process ${processUniqueId} processJson keys:`, Object.keys(processJson).join(', '));

          // Extract process name and metadata from processJson
          const processName = processJson.Name || null;
          const processExpert = processJson.Expert || null;
          const processOwner = processJson.Owner || null;
          const processStatus = processJson.State || null;

          // Extract tags and system tags from activities
          const tagSet = new Set<string>();
          const systemTagsMap = new Map<string, { id: string; name: string }>();
          const regionSet = new Set<string>();
          const activities = processJson.ProcessProcedures?.Activity || [];

          for (const activity of activities) {
            const activityTags = activity.Ownerships?.Tag || [];
            for (const tag of activityTags) {
              if (tag.Name) {
                tagSet.add(tag.Name);
              }
              if (tag.TagFamilyName === 'System' && tag.Id && tag.Name) {
                systemTagsMap.set(tag.Id.toString(), {
                  id: tag.Id.toString(),
                  name: tag.Name
                });
              }
            }

            const tasks = activity.ChildProcessProcedures?.Task || [];
            for (const task of tasks) {
              const taskTags = task.Ownerships?.Tag || [];
              for (const tag of taskTags) {
                if (tag.TagFamilyName === 'System' && tag.Id && tag.Name) {
                  systemTagsMap.set(tag.Id.toString(), {
                    id: tag.Id.toString(),
                    name: tag.Name
                  });
                }
              }
            }

            const activityRoles = activity.Ownerships?.Role || [];
            for (const role of activityRoles) {
              if (role.Name) {
                const match = role.Name.match(/\s-\s([A-Z]{2,3})$/i);
                if (match) {
                  const regionCode = match[1].toUpperCase();
                  regionSet.add(regionCode);
                }
              }
            }
          }

          const tagArray = Array.from(tagSet);
          const systemTags = Array.from(systemTagsMap.values());
          const regionCodes = Array.from(regionSet);

          // Check if #CPS230 tag exists
          const isCPS230Tagged = tagArray.some((tag: string) =>
            tag && tag.toLowerCase().includes('cps230')
          );

          // Insert discovered regions into the regions table (if they don't exist)
          for (const regionCode of regionCodes) {
            try {
              await client.query(
                `INSERT INTO regions (region_code, modified_by)
                 VALUES ($1, $2)
                 ON CONFLICT (region_code) DO NOTHING`,
                [regionCode, userProfile.email]
              );
            } catch (regionError) {
              context.warn(`Failed to insert region ${regionCode}:`, regionError);
            }
          }

          // Insert/update discovered systems from System tags
          for (const systemTag of systemTags) {
            try {
              const existingSystem = await client.query(
                `SELECT id FROM systems WHERE pm_tag_id = $1 AND account_id IS NOT DISTINCT FROM $2`,
                [systemTag.id, userProfile.account_id]
              );

              if (existingSystem.rows.length > 0) {
                await client.query(
                  `UPDATE systems
                   SET system_name = $1, system_id = $2, modified_by = $3, modified_date = NOW()
                   WHERE pm_tag_id = $4 AND account_id IS NOT DISTINCT FROM $5`,
                  [systemTag.name, systemTag.id, userProfile.email, systemTag.id, userProfile.account_id]
                );
              } else {
                await client.query(
                  `INSERT INTO systems (system_name, system_id, pm_tag_id, modified_by, account_id)
                   VALUES ($1, $2, $3, $4, $5)
                   ON CONFLICT (system_id, COALESCE(account_id, '00000000-0000-0000-0000-000000000000')) DO UPDATE
                   SET system_name = EXCLUDED.system_name, modified_by = EXCLUDED.modified_by, modified_date = NOW()`,
                  [systemTag.name, systemTag.id, systemTag.id, userProfile.email, userProfile.account_id]
                );
              }
            } catch (systemError) {
              context.warn(`Failed to upsert system ${systemTag.name}:`, systemError);
            }
          }

          const ownerData = processOwner ? { name: processOwner } : null;
          const expertData = processExpert ? { name: processExpert } : null;

          const inputs = processJson.Inputs?.Input || null;
          const outputs = processJson.Outputs?.Output || null;
          const triggers = processJson.Triggers?.Trigger || null;
          const targets = processJson.Targets?.Target || null;

          // Upsert process to database and get the process ID
          const processResult = await client.query(
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
            RETURNING id`,
            [
              processName,
              processUniqueId,
              processOwner,
              processExpert,
              processStatus,
              ownerData ? JSON.stringify(ownerData) : null,
              expertData ? JSON.stringify(expertData) : null,
              JSON.stringify({
                referenceNo: processJson.ReferenceNo || '',
                processGroup: processJson.Group || '',
                version: processJson.Version || '',
                publishState: processJson.State || '',
                objective: processJson.Objective || '',
                background: processJson.Background || '',
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

          const processId = processResult.rows[0].id;

          // Link systems to process via process_systems junction table
          await client.query(
            `DELETE FROM process_systems WHERE process_id = $1`,
            [processId]
          );

          for (const systemTag of systemTags) {
            try {
              const systemResult = await client.query(
                `SELECT id FROM systems WHERE pm_tag_id = $1 AND account_id IS NOT DISTINCT FROM $2`,
                [systemTag.id, userProfile.account_id]
              );

              if (systemResult.rows.length > 0) {
                const systemId = systemResult.rows[0].id;
                await client.query(
                  `INSERT INTO process_systems (process_id, system_id, modified_by)
                   VALUES ($1, $2, $3)
                   ON CONFLICT (process_id, system_id) DO NOTHING`,
                  [processId, systemId, userProfile.email]
                );
              }
            } catch (systemLinkError) {
              context.warn(`Failed to link system ${systemTag.name} to process ${processName}:`, systemLinkError);
            }
          }

          context.log(`Successfully synced process: ${processName}`);
          recordsSynced++;
        } catch (error: any) {
          context.error(`Error processing process ${processUniqueId}:`, error);
          errors.push(`${processUniqueId}: ${error.message}`);
        }
      }

      // Small delay between batches to avoid overwhelming the Nintex API
      if (batchIndex < totalBatches - 1) {
        await new Promise(resolve => setTimeout(resolve, 200));
      }
    }

    // Update sync history with final results
    await client.query(
      `UPDATE sync_history SET
        status = $1,
        records_synced = $2,
        processed_count = $3,
        error_message = $4,
        completed_at = NOW()
      WHERE id = $5`,
      [
        recordsSynced > 0 ? 'success' : 'failed',
        recordsSynced,
        processUniqueIds.length,
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
