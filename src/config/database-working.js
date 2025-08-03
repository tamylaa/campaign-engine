import { Pool } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

// Working database configuration extracted from successful migration script
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  max: 20,
  idleTimeoutMillis: 10000,
  connectionTimeoutMillis: 10000,
});

// Test connection with enhanced logging
pool.on('connect', (client) => {
  console.log('✅ Connected to PostgreSQL database');
  console.log('🔗 Connection details:', {
    database: client.database,
    user: client.user,
    host: client.host,
    port: client.port
  });
});

pool.on('error', (err, client) => {
  console.error('❌ Unexpected error on idle client', err);
  console.error('🔍 Client details:', {
    database: client?.database,
    user: client?.user,
    host: client?.host,
    port: client?.port
  });
  // Don't exit process immediately, let the application handle it
});

// Health check function that actually works
export const testConnection = async () => {
  try {
    const client = await pool.connect();
    const result = await client.query('SELECT NOW() as current_time, version() as pg_version');
    client.release();
    
    return {
      status: 'healthy',
      database: 'connected',
      timestamp: result.rows[0].current_time,
      version: result.rows[0].pg_version.split(' ')[0],
      error: null
    };
  } catch (error) {
    console.error('❌ Database health check failed:', error.message);
    return {
      status: 'unhealthy',
      database: 'disconnected',
      error: error.message,
      timestamp: new Date().toISOString()
    };
  }
};

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('🔄 Closing database connections...');
  await pool.end();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('🔄 Closing database connections...');
  await pool.end();
  process.exit(0);
});

export default pool;
