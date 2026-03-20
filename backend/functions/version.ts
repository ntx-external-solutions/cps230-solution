import {
  app,
  HttpRequest,
  HttpResponseInit,
  InvocationContext,
} from '@azure/functions';
import { getCorsHeaders } from '../shared/auth';
import { query } from '../shared/database';
import * as fs from 'fs';
import * as path from 'path';

// Read version from VERSION file at startup
let appVersion = 'unknown';
try {
  const versionPath = path.resolve(__dirname, '..', '..', 'VERSION');
  appVersion = fs.readFileSync(versionPath, 'utf-8').trim();
} catch {
  // VERSION file may not exist in all environments
}

async function versionFunction(
  request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  const corsHeaders = getCorsHeaders(request.headers.get('origin'));

  // Allow CORS preflight
  if (request.method === 'OPTIONS') {
    return { status: 204, headers: corsHeaders };
  }

  try {
    // Get list of applied migrations from the database
    let appliedMigrations: string[] = [];
    try {
      const migrationResult = await query<{ version: string; applied_at: string }>(
        `SELECT version, applied_at FROM schema_migrations ORDER BY version`
      );
      appliedMigrations = migrationResult.rows.map((r) => r.version);
    } catch {
      // schema_migrations table may not exist yet
    }

    return {
      status: 200,
      headers: corsHeaders,
      jsonBody: {
        version: appVersion,
        migrations: appliedMigrations,
        environment: process.env.NODE_ENV || 'development',
      },
    };
  } catch (error) {
    context.error('Version check error:', error);
    return {
      status: 500,
      headers: corsHeaders,
      jsonBody: { error: 'Failed to retrieve version information' },
    };
  }
}

app.http('version', {
  methods: ['GET', 'OPTIONS'],
  authLevel: 'anonymous',
  route: 'version',
  handler: versionFunction,
});
