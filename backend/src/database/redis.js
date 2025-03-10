/**
 * Redis Cache Implementation
 * 
 * This module provides Redis caching for API responses and
 * real-time data synchronization.
 */

const Redis = require('ioredis');
const { createSpan } = require('../middleware/monitoring/tracing');
const { cacheHitCount, cacheMissCount, cacheSetCount } = require('../middleware/monitoring/metrics');

// Create Redis client
const redis = new Redis({
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  password: process.env.REDIS_PASSWORD || '',
  db: parseInt(process.env.REDIS_DB || '0'),
  retryStrategy: (times) => {
    const delay = Math.min(times * 50, 2000);
    return delay;
  },
  maxRetriesPerRequest: 3,
  enableReadyCheck: true,
  autoResendUnfulfilledCommands: true,
  enableOfflineQueue: true
});

// Create Redis pub/sub client
const redisPubSub = new Redis({
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  password: process.env.REDIS_PASSWORD || '',
  db: parseInt(process.env.REDIS_DB || '0')
});

// Log connection events
redis.on('connect', () => {
  console.log('Connected to Redis');
});

redis.on('error', (err) => {
  console.error('Redis connection error:', err);
});

/**
 * Get a value from the cache
 * @param {string} key - Cache key
 * @returns {Promise<any>} Cached value or null
 */
async function get(key) {
  return createSpan('redis.get', { key }, async () => {
    try {
      const value = await redis.get(key);
      
      if (value) {
        // Record cache hit
        cacheHitCount.inc({ key });
        
        // Parse JSON if possible
        try {
          return JSON.parse(value);
        } catch (e) {
          return value;
        }
      } else {
        // Record cache miss
        cacheMissCount.inc({ key });
        return null;
      }
    } catch (error) {
      console.error(`Error getting cache key ${key}:`, error);
      return null;
    }
  });
}

/**
 * Set a value in the cache
 * @param {string} key - Cache key
 * @param {any} value - Value to cache
 * @param {number} ttl - Time to live in seconds
 * @returns {Promise<boolean>} Whether the operation was successful
 */
async function set(key, value, ttl = 3600) {
  return createSpan('redis.set', { key }, async () => {
    try {
      // Stringify objects
      const stringValue = typeof value === 'object' ? JSON.stringify(value) : value;
      
      if (ttl > 0) {
        await redis.set(key, stringValue, 'EX', ttl);
      } else {
        await redis.set(key, stringValue);
      }
      
      // Record cache set
      cacheSetCount.inc({ key });
      
      return true;
    } catch (error) {
      console.error(`Error setting cache key ${key}:`, error);
      return false;
    }
  });
}

/**
 * Delete a value from the cache
 * @param {string} key - Cache key
 * @returns {Promise<boolean>} Whether the operation was successful
 */
async function del(key) {
  return createSpan('redis.del', { key }, async () => {
    try {
      await redis.del(key);
      return true;
    } catch (error) {
      console.error(`Error deleting cache key ${key}:`, error);
      return false;
    }
  });
}

/**
 * Clear all cache entries with a specific prefix
 * @param {string} prefix - Key prefix
 * @returns {Promise<boolean>} Whether the operation was successful
 */
async function clearByPrefix(prefix) {
  return createSpan('redis.clearByPrefix', { prefix }, async () => {
    try {
      // Get all keys with the prefix
      const keys = await redis.keys(`${prefix}*`);
      
      if (keys.length > 0) {
        // Delete all keys
        await redis.del(...keys);
      }
      
      return true;
    } catch (error) {
      console.error(`Error clearing cache with prefix ${prefix}:`, error);
      return false;
    }
  });
}

/**
 * Get multiple values from the cache
 * @param {Array<string>} keys - Cache keys
 * @returns {Promise<Object>} Object with key-value pairs
 */
async function mget(keys) {
  return createSpan('redis.mget', { keys: keys.join(',') }, async () => {
    try {
      const values = await redis.mget(keys);
      const result = {};
      
      // Process each value
      for (let i = 0; i < keys.length; i++) {
        const key = keys[i];
        const value = values[i];
        
        if (value) {
          // Record cache hit
          cacheHitCount.inc({ key });
          
          // Parse JSON if possible
          try {
            result[key] = JSON.parse(value);
          } catch (e) {
            result[key] = value;
          }
        } else {
          // Record cache miss
          cacheMissCount.inc({ key });
          result[key] = null;
        }
      }
      
      return result;
    } catch (error) {
      console.error(`Error getting multiple cache keys:`, error);
      return {};
    }
  });
}

/**
 * Set multiple values in the cache
 * @param {Object} keyValues - Object with key-value pairs
 * @param {number} ttl - Time to live in seconds
 * @returns {Promise<boolean>} Whether the operation was successful
 */
async function mset(keyValues, ttl = 3600) {
  return createSpan('redis.mset', { keys: Object.keys(keyValues).join(',') }, async () => {
    try {
      // Prepare key-value pairs for Redis
      const args = [];
      
      for (const [key, value] of Object.entries(keyValues)) {
        // Stringify objects
        const stringValue = typeof value === 'object' ? JSON.stringify(value) : value;
        args.push(key, stringValue);
        
        // Record cache set
        cacheSetCount.inc({ key });
      }
      
      // Set values
      await redis.mset(...args);
      
      // Set TTL for each key if provided
      if (ttl > 0) {
        for (const key of Object.keys(keyValues)) {
          await redis.expire(key, ttl);
        }
      }
      
      return true;
    } catch (error) {
      console.error(`Error setting multiple cache keys:`, error);
      return false;
    }
  });
}

/**
 * Increment a counter in the cache
 * @param {string} key - Cache key
 * @param {number} increment - Increment value
 * @returns {Promise<number>} New counter value
 */
async function increment(key, increment = 1) {
  return createSpan('redis.increment', { key }, async () => {
    try {
      const value = await redis.incrby(key, increment);
      return value;
    } catch (error) {
      console.error(`Error incrementing cache key ${key}:`, error);
      return null;
    }
  });
}

/**
 * Decrement a counter in the cache
 * @param {string} key - Cache key
 * @param {number} decrement - Decrement value
 * @returns {Promise<number>} New counter value
 */
async function decrement(key, decrement = 1) {
  return createSpan('redis.decrement', { key }, async () => {
    try {
      const value = await redis.decrby(key, decrement);
      return value;
    } catch (error) {
      console.error(`Error decrementing cache key ${key}:`, error);
      return null;
    }
  });
}

/**
 * Add a value to a set
 * @param {string} key - Set key
 * @param {string|number} value - Value to add
 * @returns {Promise<boolean>} Whether the operation was successful
 */
async function sadd(key, value) {
  return createSpan('redis.sadd', { key }, async () => {
    try {
      await redis.sadd(key, value);
      return true;
    } catch (error) {
      console.error(`Error adding to set ${key}:`, error);
      return false;
    }
  });
}

/**
 * Remove a value from a set
 * @param {string} key - Set key
 * @param {string|number} value - Value to remove
 * @returns {Promise<boolean>} Whether the operation was successful
 */
async function srem(key, value) {
  return createSpan('redis.srem', { key }, async () => {
    try {
      await redis.srem(key, value);
      return true;
    } catch (error) {
      console.error(`Error removing from set ${key}:`, error);
      return false;
    }
  });
}

/**
 * Get all values in a set
 * @param {string} key - Set key
 * @returns {Promise<Array>} Set values
 */
async function smembers(key) {
  return createSpan('redis.smembers', { key }, async () => {
    try {
      const members = await redis.smembers(key);
      return members;
    } catch (error) {
      console.error(`Error getting set members ${key}:`, error);
      return [];
    }
  });
}

/**
 * Check if a value is in a set
 * @param {string} key - Set key
 * @param {string|number} value - Value to check
 * @returns {Promise<boolean>} Whether the value is in the set
 */
async function sismember(key, value) {
  return createSpan('redis.sismember', { key }, async () => {
    try {
      const isMember = await redis.sismember(key, value);
      return !!isMember;
    } catch (error) {
      console.error(`Error checking set membership ${key}:`, error);
      return false;
    }
  });
}

/**
 * Publish a message to a channel
 * @param {string} channel - Channel name
 * @param {any} message - Message to publish
 * @returns {Promise<boolean>} Whether the operation was successful
 */
async function publish(channel, message) {
  return createSpan('redis.publish', { channel }, async () => {
    try {
      // Stringify objects
      const stringMessage = typeof message === 'object' ? JSON.stringify(message) : message;
      
      await redisPubSub.publish(channel, stringMessage);
      return true;
    } catch (error) {
      console.error(`Error publishing to channel ${channel}:`, error);
      return false;
    }
  });
}

/**
 * Subscribe to a channel
 * @param {string} channel - Channel name
 * @param {Function} callback - Callback function
 * @returns {Promise<boolean>} Whether the operation was successful
 */
async function subscribe(channel, callback) {
  return createSpan('redis.subscribe', { channel }, async () => {
    try {
      await redisPubSub.subscribe(channel);
      
      redisPubSub.on('message', (receivedChannel, message) => {
        if (receivedChannel === channel) {
          // Parse JSON if possible
          try {
            const parsedMessage = JSON.parse(message);
            callback(parsedMessage);
          } catch (e) {
            callback(message);
          }
        }
      });
      
      return true;
    } catch (error) {
      console.error(`Error subscribing to channel ${channel}:`, error);
      return false;
    }
  });
}

/**
 * Unsubscribe from a channel
 * @param {string} channel - Channel name
 * @returns {Promise<boolean>} Whether the operation was successful
 */
async function unsubscribe(channel) {
  return createSpan('redis.unsubscribe', { channel }, async () => {
    try {
      await redisPubSub.unsubscribe(channel);
      return true;
    } catch (error) {
      console.error(`Error unsubscribing from channel ${channel}:`, error);
      return false;
    }
  });
}

/**
 * Check Redis connection
 * @returns {Promise<boolean>} Whether the connection is successful
 */
async function checkConnection() {
  try {
    const pong = await redis.ping();
    return pong === 'PONG';
  } catch (error) {
    console.error('Redis connection check failed:', error);
    return false;
  }
}

/**
 * Get Redis statistics
 * @returns {Promise<Object>} Redis statistics
 */
async function getStats() {
  try {
    const info = await redis.info();
    const infoLines = info.split('\r\n');
    const stats = {};
    
    // Parse info output
    for (const line of infoLines) {
      if (line && !line.startsWith('#')) {
        const [key, value] = line.split(':');
        if (key && value) {
          stats[key] = value;
        }
      }
    }
    
    return {
      usedMemory: stats.used_memory_human,
      connectedClients: stats.connected_clients,
      uptime: stats.uptime_in_seconds,
      hitRate: stats.keyspace_hits && stats.keyspace_misses
        ? parseInt(stats.keyspace_hits) / (parseInt(stats.keyspace_hits) + parseInt(stats.keyspace_misses))
        : 0,
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    console.error('Error getting Redis stats:', error);
    return {
      error: error.message,
      timestamp: new Date().toISOString()
    };
  }
}

module.exports = {
  get,
  set,
  del,
  clearByPrefix,
  mget,
  mset,
  increment,
  decrement,
  sadd,
  srem,
  smembers,
  sismember,
  publish,
  subscribe,
  unsubscribe,
  checkConnection,
  getStats,
  redis,
  redisPubSub
};
