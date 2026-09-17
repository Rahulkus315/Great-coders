import fs from 'node:fs';

export function normalizePemString(value: string | undefined) {
  if (!value) return undefined;

  const trimmed = value.trim();
  if (!trimmed) return undefined;

  return trimmed
    .replace(/\\r\\n/g, '\n')
    .replace(/\\n/g, '\n')
    .replace(/\\r/g, '\n');
}

export function buildConnectionString(databaseUrl: string) {
  const parsed = new URL(databaseUrl);
  parsed.searchParams.delete('sslmode');
  parsed.searchParams.delete('ssl');
  return parsed.toString();
}

export function buildPostgresSslConfig(env: NodeJS.ProcessEnv, targetHost?: string) {
  const databaseUrl = env.DATABASE_URL || '';
  const hostname = (targetHost || (databaseUrl ? new URL(databaseUrl).hostname : '')).toLowerCase();
  const sslRequired = env.PGSSLMODE === 'require' || hostname.includes('pooler.') || hostname.includes('supabase.') || hostname.includes('render');

  if (!sslRequired) {
    return undefined;
  }

  const caFromEnv = normalizePemString(env.SUPABASE_CA_CERT);
  if (caFromEnv) {
    return { rejectUnauthorized: true, ca: caFromEnv };
  }

  if (env.PGSSLROOTCERT) {
    try {
      return { rejectUnauthorized: true, ca: normalizePemString(fs.readFileSync(env.PGSSLROOTCERT, 'utf8')) ?? undefined };
    } catch {
      return { rejectUnauthorized: true };
    }
  }

  return { rejectUnauthorized: true };
}
