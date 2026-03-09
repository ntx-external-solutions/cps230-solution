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
import { Client } from '@microsoft/microsoft-graph-client';
import { TokenCredentialAuthenticationProvider } from '@microsoft/microsoft-graph-client/authProviders/azureTokenCredentials';
import { ClientSecretCredential } from '@azure/identity';

/**
 * Get Microsoft Graph client with admin credentials
 */
function getGraphClient(): Client {
  const credential = new ClientSecretCredential(
    process.env.AZURE_TENANT_ID || '',
    process.env.AZURE_CLIENT_ID || '',
    process.env.AZURE_CLIENT_SECRET || ''
  );

  const authProvider = new TokenCredentialAuthenticationProvider(credential, {
    scopes: ['https://graph.microsoft.com/.default'],
  });

  return Client.initWithMiddleware({
    authProvider,
  });
}

/**
 * Create a new Azure AD user with username/password
 * Only accessible to Promaster users
 */
async function createAzureUser(
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
    // Authenticate and check permissions
    const userProfile = await authenticateRequestUnified(request);

    if (!hasRole(userProfile.role, ['promaster'])) {
      return {
        status: 403,
        headers: corsHeaders,
        jsonBody: { error: 'Only Promaster users can create Azure AD users' },
      };
    }

    const body = await request.json() as any;

    // Validate required fields
    if (!body.email || !body.displayName || !body.password) {
      return {
        status: 400,
        headers: corsHeaders,
        jsonBody: {
          error: 'email, displayName, and password are required',
        },
      };
    }

    // Create user in Azure AD
    const graphClient = getGraphClient();

    const newUser = {
      accountEnabled: true,
      displayName: body.displayName,
      mailNickname: body.email.split('@')[0], // Use email prefix as nickname
      userPrincipalName: body.email,
      passwordProfile: {
        forceChangePasswordNextSignIn: body.forceChangePassword ?? true,
        password: body.password,
      },
      // Optional: Add to specific groups or assign roles
      ...(body.jobTitle && { jobTitle: body.jobTitle }),
      ...(body.department && { department: body.department }),
    };

    const createdUser = await graphClient
      .api('/users')
      .post(newUser);

    context.log('Azure AD user created:', createdUser.id);

    // Create user profile in database
    const pool = getPool();
    await setSessionContext(pool, userProfile.azureAdObjectId, userProfile.role, userProfile.accountId);

    const dbResult = await query(
      `INSERT INTO user_profiles (
        azure_ad_object_id, email, full_name, role
      ) VALUES ($1, $2, $3, $4)
      ON CONFLICT (azure_ad_object_id) DO UPDATE
      SET email = EXCLUDED.email, full_name = EXCLUDED.full_name, updated_at = NOW()
      RETURNING id, azure_ad_object_id, email, full_name, role, created_at, updated_at`,
      [
        createdUser.id,
        createdUser.userPrincipalName,
        createdUser.displayName,
        body.role || 'user',
      ]
    );

    return {
      status: 201,
      headers: corsHeaders,
      jsonBody: {
        data: {
          azureUser: {
            id: createdUser.id,
            userPrincipalName: createdUser.userPrincipalName,
            displayName: createdUser.displayName,
          },
          profile: dbResult.rows[0],
        },
        message: 'Azure AD user and profile created successfully',
      },
    };
  } catch (error: any) {
    context.error('Error creating Azure AD user:', error);

    // Handle specific Graph API errors
    if (error.statusCode === 409 || error.code === 'Request_ResourceNotFound') {
      return {
        status: 409,
        headers: corsHeaders,
        jsonBody: {
          error: 'User already exists in Azure AD',
          details: error.message,
        },
      };
    }

    return {
      status: 500,
      headers: corsHeaders,
      jsonBody: {
        error: 'Failed to create Azure AD user',
        details: error.message,
      },
    };
  }
}

/**
 * List all Azure AD users
 * Only accessible to Promaster users
 */
async function listAzureUsers(
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
    // Authenticate and check permissions
    const userProfile = await authenticateRequestUnified(request);

    if (!hasRole(userProfile.role, ['promaster'])) {
      return {
        status: 403,
        headers: corsHeaders,
        jsonBody: { error: 'Only Promaster users can list Azure AD users' },
      };
    }

    const graphClient = getGraphClient();

    const users = await graphClient
      .api('/users')
      .select('id,displayName,userPrincipalName,accountEnabled,createdDateTime')
      .top(100)
      .get();

    return {
      status: 200,
      headers: corsHeaders,
      jsonBody: {
        data: users.value,
      },
    };
  } catch (error: any) {
    context.error('Error listing Azure AD users:', error);

    return {
      status: 500,
      headers: corsHeaders,
      jsonBody: {
        error: 'Failed to list Azure AD users',
        details: error.message,
      },
    };
  }
}

/**
 * Delete an Azure AD user
 * Only accessible to Promaster users
 */
async function deleteAzureUser(
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
    // Authenticate and check permissions
    const userProfile = await authenticateRequestUnified(request);

    if (!hasRole(userProfile.role, ['promaster'])) {
      return {
        status: 403,
        headers: corsHeaders,
        jsonBody: { error: 'Only Promaster users can delete Azure AD users' },
      };
    }

    const userId = request.params.userId;
    if (!userId) {
      return {
        status: 400,
        headers: corsHeaders,
        jsonBody: { error: 'User ID is required' },
      };
    }

    const graphClient = getGraphClient();

    // Delete user from Azure AD
    await graphClient
      .api(`/users/${userId}`)
      .delete();

    context.log('Azure AD user deleted:', userId);

    // Delete from database (optional - could also keep for audit trail)
    const pool = getPool();
    await setSessionContext(pool, userProfile.azureAdObjectId, userProfile.role, userProfile.accountId);

    await query(
      'DELETE FROM user_profiles WHERE azure_ad_object_id = $1',
      [userId]
    );

    return {
      status: 200,
      headers: corsHeaders,
      jsonBody: {
        message: 'User deleted successfully from Azure AD and database',
      },
    };
  } catch (error: any) {
    context.error('Error deleting Azure AD user:', error);

    if (error.statusCode === 404) {
      return {
        status: 404,
        headers: corsHeaders,
        jsonBody: {
          error: 'User not found in Azure AD',
        },
      };
    }

    return {
      status: 500,
      headers: corsHeaders,
      jsonBody: {
        error: 'Failed to delete Azure AD user',
        details: error.message,
      },
    };
  }
}

/**
 * Reset an Azure AD user's password
 * Only accessible to Promaster users
 */
async function resetUserPassword(
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
    // Authenticate and check permissions
    const userProfile = await authenticateRequestUnified(request);

    if (!hasRole(userProfile.role, ['promaster'])) {
      return {
        status: 403,
        headers: corsHeaders,
        jsonBody: { error: 'Only Promaster users can reset passwords' },
      };
    }

    const userId = request.params.userId;
    const body = await request.json() as any;

    if (!userId || !body.newPassword) {
      return {
        status: 400,
        headers: corsHeaders,
        jsonBody: { error: 'User ID and newPassword are required' },
      };
    }

    const graphClient = getGraphClient();

    // Update user's password
    await graphClient
      .api(`/users/${userId}`)
      .update({
        passwordProfile: {
          forceChangePasswordNextSignIn: body.forceChangePassword ?? true,
          password: body.newPassword,
        },
      });

    context.log('Password reset for user:', userId);

    return {
      status: 200,
      headers: corsHeaders,
      jsonBody: {
        message: 'Password reset successfully',
      },
    };
  } catch (error: any) {
    context.error('Error resetting password:', error);

    if (error.statusCode === 404) {
      return {
        status: 404,
        headers: corsHeaders,
        jsonBody: {
          error: 'User not found in Azure AD',
        },
      };
    }

    return {
      status: 500,
      headers: corsHeaders,
      jsonBody: {
        error: 'Failed to reset password',
        details: error.message,
      },
    };
  }
}

// Register the functions
app.http('azure-users-create', {
  methods: ['POST', 'OPTIONS'],
  authLevel: 'anonymous',
  route: 'azure-users',
  handler: createAzureUser,
});

app.http('azure-users-list', {
  methods: ['GET', 'OPTIONS'],
  authLevel: 'anonymous',
  route: 'azure-users',
  handler: listAzureUsers,
});

app.http('azure-users-delete', {
  methods: ['DELETE', 'OPTIONS'],
  authLevel: 'anonymous',
  route: 'azure-users/{userId}',
  handler: deleteAzureUser,
});

app.http('azure-users-reset-password', {
  methods: ['PATCH', 'OPTIONS'],
  authLevel: 'anonymous',
  route: 'azure-users/{userId}/reset-password',
  handler: resetUserPassword,
});
