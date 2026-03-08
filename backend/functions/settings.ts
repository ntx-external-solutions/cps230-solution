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
import { query, setSessionContext, getPool } from '../shared/database';
import { validateSettingInput, ValidationError, isValidUUID } from '../shared/validation';

/**
 * Settings HTTP trigger function
 * Handles CRUD operations for application settings
 */
export async function settingsFunction(
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
    // Authenticate user (supports both Azure AD and local JWT)
    const userProfile = await authenticateRequestUnified(request);

    // Set session context for RLS
    const pool = getPool();
    await setSessionContext(pool, userProfile.azureAdObjectId, userProfile.role, userProfile.accountId);

    const url = new URL(request.url);
    const id = url.searchParams.get('id');
    const key = url.searchParams.get('key');

    switch (request.method) {
      case 'GET':
        return await handleGet(id, key, userProfile, corsHeaders, context);

      case 'POST':
        return await handlePost(request, userProfile, corsHeaders, context);

      case 'PUT':
      case 'PATCH':
        return await handleUpdate(request, id, key, userProfile, corsHeaders, context);

      case 'DELETE':
        return await handleDelete(id, key, userProfile, corsHeaders, context);

      default:
        return {
          status: 405,
          headers: corsHeaders,
          jsonBody: { error: 'Method not allowed' },
        };
    }
  } catch (error: any) {
    context.error('Error in settings function:', error);

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
  }
}

/**
 * Handle GET request - Retrieve setting(s)
 */
async function handleGet(
  id: string | null,
  key: string | null,
  userProfile: any,
  corsHeaders: Record<string, string>,
  context: InvocationContext
): Promise<HttpResponseInit> {
  if (id) {
    // Validate UUID
    if (!isValidUUID(id)) {
      return {
        status: 400,
        headers: corsHeaders,
        jsonBody: { error: 'Invalid setting ID format' },
      };
    }

    // Get single setting
    const result = await query(
      'SELECT * FROM settings WHERE id = $1',
      [id]
    );

    if (result.rows.length === 0) {
      return {
        status: 404,
        headers: corsHeaders,
        jsonBody: { error: 'Setting not found' },
      };
    }

    const setting = result.rows[0];

    // Mask sensitive values for non-promasters
    if (setting.is_sensitive && !hasRole(userProfile.role, ['promaster'])) {
      setting.value = '***REDACTED***';
    }

    return {
      status: 200,
      headers: corsHeaders,
      jsonBody: { data: setting },
    };
  } else if (key) {
    // Get setting by key
    const result = await query(
      'SELECT * FROM settings WHERE key = $1',
      [key]
    );

    if (result.rows.length === 0) {
      return {
        status: 404,
        headers: corsHeaders,
        jsonBody: { error: 'Setting not found' },
      };
    }

    const setting = result.rows[0];

    // Mask sensitive values for non-promasters
    if (setting.is_sensitive && !hasRole(userProfile.role, ['promaster'])) {
      setting.value = '***REDACTED***';
    }

    return {
      status: 200,
      headers: corsHeaders,
      jsonBody: { data: setting },
    };
  } else {
    // Get all settings (RLS will filter based on user role)
    const result = await query(
      'SELECT * FROM settings ORDER BY key ASC'
    );

    // Mask sensitive values for non-promasters
    const settings = result.rows.map((setting: any) => {
      if (setting.is_sensitive && !hasRole(userProfile.role, ['promaster'])) {
        return {
          ...setting,
          value: '***REDACTED***',
        };
      }
      return setting;
    });

    return {
      status: 200,
      headers: corsHeaders,
      jsonBody: { data: settings },
    };
  }
}

/**
 * Handle POST request - Create new setting
 */
async function handlePost(
  request: HttpRequest,
  userProfile: any,
  corsHeaders: Record<string, string>,
  context: InvocationContext
): Promise<HttpResponseInit> {
  // Check permissions - only promasters can modify settings
  if (!hasRole(userProfile.role, ['promaster'])) {
    return {
      status: 403,
      headers: corsHeaders,
      jsonBody: { error: 'Insufficient permissions. Only Promasters can create settings.' },
    };
  }

  const body = await request.json() as any;
  const validatedData = validateSettingInput(body);

  const result = await query(
    `INSERT INTO settings (
      key, value, description, is_sensitive, modified_by, account_id
    ) VALUES ($1, $2, $3, $4, $5, $6)
    RETURNING *`,
    [
      validatedData.key,
      JSON.stringify(validatedData.value), // Convert to JSON string for JSONB column
      validatedData.description || null,
      validatedData.is_sensitive || false,
      userProfile.email,
      userProfile.accountId || null,
    ]
  );

  return {
    status: 201,
    headers: corsHeaders,
    jsonBody: { data: result.rows[0] },
  };
}

/**
 * Handle PUT/PATCH request - Update setting
 */
async function handleUpdate(
  request: HttpRequest,
  id: string | null,
  key: string | null,
  userProfile: any,
  corsHeaders: Record<string, string>,
  context: InvocationContext
): Promise<HttpResponseInit> {
  if (!id && !key) {
    return {
      status: 400,
      headers: corsHeaders,
      jsonBody: { error: 'Setting ID or key is required' },
    };
  }

  if (id && !isValidUUID(id)) {
    return {
      status: 400,
      headers: corsHeaders,
      jsonBody: { error: 'Invalid setting ID format' },
    };
  }

  // Check permissions - only promasters can modify settings
  if (!hasRole(userProfile.role, ['promaster'])) {
    return {
      status: 403,
      headers: corsHeaders,
      jsonBody: { error: 'Insufficient permissions. Only Promasters can update settings.' },
    };
  }

  const body = await request.json() as any;

  // For updates, we don't change the key
  const sanitized: any = {};
  if (body.value !== undefined) {
    // Convert value to JSON string for JSONB column
    sanitized.value = JSON.stringify(body.value);
  }
  if (body.description !== undefined) sanitized.description = body.description;
  if (body.is_sensitive !== undefined) sanitized.is_sensitive = body.is_sensitive;

  let result;
  if (id) {
    result = await query(
      `UPDATE settings SET
        value = COALESCE($1, value),
        description = COALESCE($2, description),
        is_sensitive = COALESCE($3, is_sensitive),
        modified_by = $4,
        modified_date = NOW()
      WHERE id = $5
      RETURNING *`,
      [
        sanitized.value,
        sanitized.description,
        sanitized.is_sensitive,
        userProfile.email,
        id,
      ]
    );
  } else if (key) {
    // Use UPSERT pattern to create setting if it doesn't exist
    result = await query(
      `INSERT INTO settings (key, value, description, is_sensitive, modified_by, account_id)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (key, account_id)
       DO UPDATE SET
         value = COALESCE($2, settings.value),
         description = COALESCE($3, settings.description),
         is_sensitive = COALESCE($4, settings.is_sensitive),
         modified_by = $5,
         modified_date = NOW()
       RETURNING *`,
      [
        key,
        sanitized.value,
        sanitized.description,
        sanitized.is_sensitive,
        userProfile.email,
        userProfile.accountId || null,
      ]
    );
  } else {
    return {
      status: 400,
      headers: corsHeaders,
      jsonBody: { error: 'Setting ID or key is required' },
    };
  }

  if (result.rows.length === 0) {
    return {
      status: 404,
      headers: corsHeaders,
      jsonBody: { error: 'Setting not found' },
    };
  }

  return {
    status: 200,
    headers: corsHeaders,
    jsonBody: { data: result.rows[0] },
  };
}

/**
 * Handle DELETE request - Delete setting
 */
async function handleDelete(
  id: string | null,
  key: string | null,
  userProfile: any,
  corsHeaders: Record<string, string>,
  context: InvocationContext
): Promise<HttpResponseInit> {
  if (!id && !key) {
    return {
      status: 400,
      headers: corsHeaders,
      jsonBody: { error: 'Setting ID or key is required' },
    };
  }

  if (id && !isValidUUID(id)) {
    return {
      status: 400,
      headers: corsHeaders,
      jsonBody: { error: 'Invalid setting ID format' },
    };
  }

  // Check permissions - only promasters can modify settings
  if (!hasRole(userProfile.role, ['promaster'])) {
    return {
      status: 403,
      headers: corsHeaders,
      jsonBody: { error: 'Insufficient permissions. Only Promasters can delete settings.' },
    };
  }

  let result;
  if (id) {
    result = await query('DELETE FROM settings WHERE id = $1 RETURNING id', [id]);
  } else {
    result = await query('DELETE FROM settings WHERE key = $1 RETURNING id', [key]);
  }

  if (result.rows.length === 0) {
    return {
      status: 404,
      headers: corsHeaders,
      jsonBody: { error: 'Setting not found' },
    };
  }

  return {
    status: 200,
    headers: corsHeaders,
    jsonBody: { success: true },
  };
}

// Register the function
app.http('settings', {
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  authLevel: 'anonymous',
  handler: settingsFunction,
});
