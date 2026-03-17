import { Pool, PoolClient, QueryResult, QueryResultRow } from 'pg';

// Database connection pool
let pool: Pool | null = null;

/**
 * Get or create the PostgreSQL connection pool
 */
export function getPool(): Pool {
  if (!pool) {
    const connectionString = process.env.POSTGRESQL_CONNECTION_STRING;

    if (!connectionString) {
      throw new Error('POSTGRESQL_CONNECTION_STRING environment variable is not set');
    }

    pool = new Pool({
      connectionString,
      ssl: {
        rejectUnauthorized: true,
      },
      max: 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 10000,
    });

    // Handle pool errors
    pool.on('error', (err: Error) => {
      console.error('Unexpected error on idle PostgreSQL client', err);
    });
  }

  return pool;
}

/**
 * Execute a query with a pool client
 * @param query SQL query string
 * @param params Query parameters
 * @returns Query result
 */
export async function query<T extends QueryResultRow = any>(
  query: string,
  params?: any[]
): Promise<QueryResult<T>> {
  const pool = getPool();
  return pool.query<T>(query, params);
}

/**
 * Get a client from the pool for transactions
 */
export async function getClient(): Promise<PoolClient> {
  const pool = getPool();
  return pool.connect();
}

/**
 * Execute a function within a transaction
 * @param callback Function to execute within transaction
 * @returns Result of the callback
 */
export async function withTransaction<T>(
  callback: (client: PoolClient) => Promise<T>
): Promise<T> {
  const client = await getClient();

  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Set session variables for RLS policies
 * @param client Database client
 * @param userId User's ID (used for local users)
 * @param azureAdObjectId User's Azure AD object ID (for Azure AD SSO users)
 * @param role User's role
 */
export async function setSessionContext(
  client: PoolClient | Pool,
  userId: string,
  azureAdObjectId: string | undefined,
  role: string
): Promise<void> {
  await client.query(
    `SELECT set_config('app.current_user_id', $1, false),
            set_config('app.current_user_azure_id', $2, false),
            set_config('app.current_user_role', $3, false)`,
    [userId, azureAdObjectId || '', role]
  );
}

/**
 * Clear session variables
 * @param client Database client
 */
export async function clearSessionContext(
  client: PoolClient | Pool
): Promise<void> {
  await client.query(
    `SELECT set_config('app.current_user_azure_id', '', false),
            set_config('app.current_user_role', 'user', false)`
  );
}

/**
 * Close the database pool (for graceful shutdown)
 */
export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}
