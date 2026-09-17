import fs from 'node:fs';
import dotenv from 'dotenv';
import { Pool, PoolClient } from 'pg';

dotenv.config();

const REQUIRED_ENV = ['DATABASE_URL', 'RAHUL_PASSWORD_HASH', 'DILEEP_PASSWORD_HASH'] as const;
const REQUIRED_PARTICIPANTS = [
  {
    legacyId: 'user-rahul',
    email: 'rahulkushwaha181@gmail.com',
    passwordHashEnv: 'RAHUL_PASSWORD_HASH',
  },
  {
    legacyId: 'user-dileep',
    email: 'dileepkewat011@gmail.com',
    passwordHashEnv: 'DILEEP_PASSWORD_HASH',
  },
] as const;

function getRuntimeHost(hostname: string | undefined) {
  return (hostname || '').toLowerCase();
}

function isLoopbackHost(hostname: string) {
  const host = hostname.toLowerCase();
  return host === 'localhost' || host === '127.0.0.1' || host.startsWith('localhost.') || host.startsWith('127.0.0.1.');
}

function isProductionDatabaseHost(hostname: string) {
  const host = hostname.toLowerCase();
  if (!host || isLoopbackHost(host)) return false;
  return host.includes('render') || host.includes('supabase') || host.includes('pooler') || host.includes('prod') || host.includes('production');
}

function getSslConfig(env: NodeJS.ProcessEnv) {
  const databaseUrl = env.DATABASE_URL || '';
  if (!databaseUrl) {
    return undefined;
  }

  const connectionString = new URL(databaseUrl);
  const sslRequired = env.PGSSLMODE === 'require' || connectionString.hostname.includes('pooler.') || connectionString.hostname.includes('supabase.');

  if (!sslRequired) {
    return undefined;
  }

  if (env.SUPABASE_CA_CERT) {
    return { rejectUnauthorized: true, ca: env.SUPABASE_CA_CERT };
  }

  if (env.PGSSLROOTCERT) {
    try {
      return { rejectUnauthorized: true, ca: fs.readFileSync(env.PGSSLROOTCERT, 'utf8') };
    } catch {
      return { rejectUnauthorized: true };
    }
  }

  return { rejectUnauthorized: true };
}

async function assertProductionGuard(client: PoolClient) {
  const result = await client.query<{
    current_database: string;
    db_host: string;
    server_version: string;
  }>(`
    SELECT
      current_database() AS current_database,
      inet_server_addr()::text AS db_host,
      current_setting('server_version') AS server_version
  `);

  const row = result.rows[0];
  if (!row) {
    throw new Error('Database identity lookup failed.');
  }

  const host = getRuntimeHost(row.db_host || '');
  if (!host || !isProductionDatabaseHost(host)) {
    throw new Error('Production database guard failed: host is not a production database target.');
  }

  if (process.env.NODE_ENV !== 'production') {
    throw new Error('Production credential initialization is only allowed when NODE_ENV=production.');
  }

  if (process.env.PRODUCTION_CREDENTIAL_INIT !== 'true') {
    throw new Error('Production credential initialization can only run when PRODUCTION_CREDENTIAL_INIT=true.');
  }

  return {
    database: row.current_database,
    host,
    version: row.server_version,
  };
}

async function fetchActiveParticipantRows(client: PoolClient) {
  const result = await client.query<{ legacy_id: string; email: string; password_hash: string | null; status: string }>(`
    SELECT legacy_id, email, password_hash, status
    FROM public.participants
    WHERE legacy_id = ANY($1::text[]) AND status = 'ACTIVE'
  `, [REQUIRED_PARTICIPANTS.map((participant) => participant.legacyId)]);

  return result.rows;
}

export async function initializeProductionCredentials(): Promise<void> {
  if (process.env.PRODUCTION_CREDENTIAL_INIT !== 'true') {
    return;
  }

  if (process.env.NODE_ENV !== 'production') {
    throw new Error('Production credential initialization requires NODE_ENV=production.');
  }

  for (const key of REQUIRED_ENV) {
    if (!process.env[key]) {
      throw new Error(`Missing required environment variable: ${key}`);
    }
  }

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error('Missing required environment variable: DATABASE_URL');
  }

  const url = new URL(databaseUrl);
  const host = getRuntimeHost(url.hostname);
  if (!host || !isProductionDatabaseHost(host)) {
    throw new Error('Refusing to initialize credentials: DATABASE_URL is not a verified production database target.');
  }

  const sslConfig = getSslConfig(process.env);
  const pool = new Pool({
    connectionString: databaseUrl,
    ...(sslConfig ? { ssl: sslConfig } : {}),
  });

  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    await client.query("SELECT pg_advisory_xact_lock(hashtext('great-coders-production-credentials-v1'))");
    await assertProductionGuard(client);

    const activeRows = await fetchActiveParticipantRows(client);
    if (activeRows.length !== REQUIRED_PARTICIPANTS.length) {
      throw new Error('Production credential initialization requires exactly one ACTIVE Rahul row and exactly one ACTIVE Dileep row.');
    }

    const activeByLegacyId = new Map(activeRows.map((row) => [row.legacy_id, row]));
    for (const participant of REQUIRED_PARTICIPANTS) {
      const row = activeByLegacyId.get(participant.legacyId);
      if (!row) {
        throw new Error(`Missing ACTIVE participant row for ${participant.legacyId}.`);
      }
      if (row.email !== participant.email) {
        throw new Error(`Participant ${participant.legacyId} email mismatch before credential initialization.`);
      }
      if (row.password_hash !== null && row.password_hash !== '') {
        return;
      }
    }

    for (const participant of REQUIRED_PARTICIPANTS) {
      const row = activeByLegacyId.get(participant.legacyId);
      if (!row || row.password_hash !== null && row.password_hash !== '') {
        return;
      }
    }

    const nextPasswordHashes = new Map(
      REQUIRED_PARTICIPANTS.map((participant) => [participant.legacyId, process.env[participant.passwordHashEnv] || ''])
    );

    for (const participant of REQUIRED_PARTICIPANTS) {
      if (!nextPasswordHashes.get(participant.legacyId)) {
        throw new Error(`Missing required environment variable: ${participant.passwordHashEnv}`);
      }
    }

    const updateResult = await client.query<{ legacy_id: string }>(`
      UPDATE public.participants
      SET password_hash = CASE
        WHEN legacy_id = 'user-rahul' THEN $1
        WHEN legacy_id = 'user-dileep' THEN $2
        ELSE password_hash
      END
      WHERE legacy_id = ANY($3::text[])
        AND status = 'ACTIVE'
        AND email = ANY($4::text[])
        AND password_hash IS NULL
      RETURNING legacy_id
    `, [
      nextPasswordHashes.get('user-rahul'),
      nextPasswordHashes.get('user-dileep'),
      REQUIRED_PARTICIPANTS.map((participant) => participant.legacyId),
      REQUIRED_PARTICIPANTS.map((participant) => participant.email),
    ]);

    if (updateResult.rowCount !== REQUIRED_PARTICIPANTS.length) {
      throw new Error('Credential initialization failed because the target rows were not updated as expected.');
    }

    const verification = await client.query<{ rahul_count: number; dileep_count: number }>(`
      SELECT
        COUNT(*) FILTER (
          WHERE legacy_id = 'user-rahul'
            AND email = 'rahulkushwaha181@gmail.com'
            AND status = 'ACTIVE'
            AND password_hash IS NOT NULL
        )::int AS rahul_count,
        COUNT(*) FILTER (
          WHERE legacy_id = 'user-dileep'
            AND email = 'dileepkewat011@gmail.com'
            AND status = 'ACTIVE'
            AND password_hash IS NOT NULL
        )::int AS dileep_count
      FROM public.participants
      WHERE legacy_id = ANY($1::text[])
        AND status = 'ACTIVE'
    `, [REQUIRED_PARTICIPANTS.map((participant) => participant.legacyId)]);

    const verified = verification.rows[0];
    if (!verified || Number(verified.rahul_count ?? 0) !== 1 || Number(verified.dileep_count ?? 0) !== 1) {
      throw new Error('Credential verification failed after update: one or both target rows does not have a populated password_hash.');
    }

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

if (process.argv[1] && process.argv[1].includes('initialize-production-credentials')) {
  void initializeProductionCredentials().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error('Production credential initialization aborted:', message);
    process.exitCode = 1;
  });
}
