/**
 * PostgreSQL Database Connection
 * 
 * This module provides a connection to PostgreSQL and TimescaleDB
 * for data storage and real-time analytics.
 */

const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
const { createSpan } = require('../middleware/monitoring/tracing');
const { dbQueryDuration } = require('../middleware/monitoring/metrics');

// Create a connection pool
const pool = new Pool({
  user: process.env.POSTGRES_USER || 'postgres',
  host: process.env.POSTGRES_HOST || 'localhost',
  database: process.env.POSTGRES_DB || 'uc_hub',
  password: process.env.POSTGRES_PASSWORD || 'postgres',
  port: parseInt(process.env.POSTGRES_PORT || '5432'),
  max: parseInt(process.env.POSTGRES_MAX_CONNECTIONS || '20'),
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
  ssl: process.env.POSTGRES_SSL === 'true' ? {
    rejectUnauthorized: false
  } : false
});

// Log connection events
pool.on('connect', () => {
  console.log('Connected to PostgreSQL');
});

pool.on('error', (err) => {
  console.error('PostgreSQL connection error:', err);
});

/**
 * Execute a query with tracing and metrics
 * @param {string} text - SQL query text
 * @param {Array} params - Query parameters
 * @param {string} name - Query name for metrics
 * @returns {Promise<Object>} Query result
 */
async function query(text, params, name = 'unnamed') {
  const startTime = Date.now();
  
  return createSpan(`db.query.${name}`, {}, async () => {
    try {
      const result = await pool.query(text, params);
      
      // Record query duration
      const duration = Date.now() - startTime;
      dbQueryDuration.observe({ query: name }, duration / 1000);
      
      return result;
    } catch (error) {
      console.error(`Error executing query ${name}:`, error);
      throw error;
    }
  });
}

/**
 * Execute a transaction with multiple queries
 * @param {Function} callback - Transaction callback
 * @returns {Promise<any>} Transaction result
 */
async function transaction(callback) {
  const client = await pool.connect();
  
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
 * Initialize the database schema
 * @returns {Promise<void>}
 */
async function initializeSchema() {
  try {
    // Check if TimescaleDB extension is available
    const extensionResult = await query('SELECT EXISTS(SELECT 1 FROM pg_extension WHERE extname = \'timescaledb\')');
    const timescaleAvailable = extensionResult.rows[0].exists;
    
    if (timescaleAvailable) {
      console.log('TimescaleDB extension is available');
      
      // Create TimescaleDB extension if not exists
      await query('CREATE EXTENSION IF NOT EXISTS timescaledb CASCADE');
    } else {
      console.warn('TimescaleDB extension is not available. Time-series optimizations will not be applied.');
    }
    
    // Load schema files
    const schemaDir = path.join(__dirname, 'schema');
    const schemaFiles = fs.readdirSync(schemaDir)
      .filter(file => file.endsWith('.sql'))
      .sort(); // Sort to ensure correct order
    
    // Execute schema files in transaction
    await transaction(async (client) => {
      for (const file of schemaFiles) {
        const filePath = path.join(schemaDir, file);
        const schema = fs.readFileSync(filePath, 'utf8');
        
        console.log(`Executing schema file: ${file}`);
        await client.query(schema);
      }
    });
    
    console.log('Database schema initialized successfully');
  } catch (error) {
    console.error('Error initializing database schema:', error);
    throw error;
  }
}

/**
 * Check database connection
 * @returns {Promise<boolean>} Whether the connection is successful
 */
async function checkConnection() {
  try {
    const result = await query('SELECT NOW()');
    return !!result;
  } catch (error) {
    console.error('Database connection check failed:', error);
    return false;
  }
}

/**
 * Get database statistics
 * @returns {Promise<Object>} Database statistics
 */
async function getStats() {
  try {
    // Get database size
    const sizeResult = await query(`
      SELECT pg_size_pretty(pg_database_size(current_database())) as size
    `);
    
    // Get table counts
    const tableCountResult = await query(`
      SELECT count(*) as table_count
      FROM information_schema.tables
      WHERE table_schema = 'public'
    `);
    
    // Get connection count
    const connectionCountResult = await query(`
      SELECT count(*) as connection_count
      FROM pg_stat_activity
      WHERE datname = current_database()
    `);
    
    return {
      size: sizeResult.rows[0].size,
      tableCount: parseInt(tableCountResult.rows[0].table_count),
      connectionCount: parseInt(connectionCountResult.rows[0].connection_count),
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    console.error('Error getting database stats:', error);
    return {
      error: error.message,
      timestamp: new Date().toISOString()
    };
  }
}

module.exports = {
  query,
  transaction,
  initializeSchema,
  checkConnection,
  getStats,
  pool
};
