#!/usr/bin/env node

/**
 * Direct copy of the working migration database connection
 * This works, so let's use it exactly as-is
 */

import { Pool } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

// EXACT copy from working migration script
const workingPool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  max: 1,
  idleTimeoutMillis: 10000,
  connectionTimeoutMillis: 10000,
});

// Working health check function
export const healthCheck = async () => {
  try {
    console.log('🔍 Running health check...');
    const testResult = await workingPool.query('SELECT NOW() as current_time');
    console.log('✅ Health check successful:', testResult.rows[0].current_time);
    
    return {
      status: 'healthy',
      database: 'connected',
      timestamp: testResult.rows[0].current_time,
      message: 'Using working migration pattern'
    };
  } catch (error) {
    console.error('❌ Health check failed:', error.message);
    return {
      status: 'unhealthy',
      database: 'disconnected',
      error: error.message,
      timestamp: new Date().toISOString()
    };
  }
};

export default workingPool;
