import { Pool, PoolClient } from 'pg';
import * as dotenv from 'dotenv';

dotenv.config();

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME || 'bughouse',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

pool.on('error', (err) => {
  console.error('[Database] Unexpected error on idle client', err);
  process.exit(-1);
});

export async function query(text: string, params?: any[]) {
  const start = Date.now();
  const res = await pool.query(text, params);
  const duration = Date.now() - start;
  console.log('[Database] Query executed', { text, duration, rows: res.rowCount });
  return res;
}

export async function getClient(): Promise<PoolClient> {
  const client = await pool.connect();
  return client;
}

export async function testConnection(): Promise<boolean> {
  try {
    const result = await query('SELECT NOW()');
    console.log('[Database] Connection successful:', result.rows[0]);
    return true;
  } catch (error) {
    console.error('[Database] Connection failed:', error);
    return false;
  }
}

export async function shutdown(): Promise<void> {
  await pool.end();
  console.log('[Database] Pool has ended');
}

export { pool };
