/**
 * Rate Limiting Middleware
 * 
 * This middleware provides rate limiting functionality to protect
 * against abuse and DoS attacks.
 */

const Redis = require('ioredis');
const { ApolloError } = require('apollo-server-express');

class RateLimiter {
  constructor() {
    this.redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');
    this.enabled = process.env.RATE_LIMIT_ENABLED !== 'false';
    this.defaultLimit = parseInt(process.env.RATE_LIMIT_DEFAULT || '100', 10);
    this.defaultWindow = parseInt(process.env.RATE_LIMIT_WINDOW || '60', 10); // in seconds
  }
  
  /**
   * Create a rate limiter middleware
   * @param {Object} options - Rate limiter options
   * @param {string} options.name - Name of the rate limiter
   * @param {number} options.limit - Maximum number of requests
   * @param {number} options.window - Time window in seconds
   * @returns {Function} Middleware function
   */
  middleware({ name, limit, window }) {
    const actualLimit = limit || this.defaultLimit;
    const actualWindow = window || this.defaultWindow;
    
    return async (root, args, context, info) => {
      if (!this.enabled) {
        return true;
      }
      
      const { user, req } = context;
      
      // Use user ID if available, otherwise use IP address
      const identifier = user ? `user:${user.id}` : `ip:${this.getClientIp(req)}`;
      const key = `rate-limit:${name}:${identifier}`;
      
      // Increment the counter
      const count = await this.redis.incr(key);
      
      // Set expiration if this is the first request
      if (count === 1) {
        await this.redis.expire(key, actualWindow);
      }
      
      // Get the TTL
      const ttl = await this.redis.ttl(key);
      
      // Check if the limit has been exceeded
      if (count > actualLimit) {
        throw new ApolloError(
          'Rate limit exceeded',
          'RATE_LIMIT_EXCEEDED',
          {
            limit: actualLimit,
            window: actualWindow,
            remaining: 0,
            resetIn: ttl
          }
        );
      }
      
      // Add rate limit info to the context
      context.rateLimit = {
        limit: actualLimit,
        remaining: actualLimit - count,
        resetIn: ttl
      };
      
      return true;
    };
  }
  
  /**
   * Get the client IP address
   * @param {Object} req - Express request object
   * @returns {string} Client IP address
   */
  getClientIp(req) {
    return req.headers['x-forwarded-for']?.split(',')[0].trim() ||
      req.connection?.remoteAddress ||
      req.socket?.remoteAddress ||
      req.connection?.socket?.remoteAddress ||
      '0.0.0.0';
  }
  
  /**
   * Create a rate limiter for a specific operation
   * @param {string} operationName - GraphQL operation name
   * @param {number} limit - Maximum number of requests
   * @param {number} window - Time window in seconds
   * @returns {Function} Middleware function
   */
  forOperation(operationName, limit, window) {
    return this.middleware({
      name: `operation:${operationName}`,
      limit,
      window
    });
  }
  
  /**
   * Create a rate limiter for authentication operations
   * @param {number} limit - Maximum number of requests
   * @param {number} window - Time window in seconds
   * @returns {Function} Middleware function
   */
  forAuth(limit = 10, window = 60) {
    return this.middleware({
      name: 'auth',
      limit,
      window
    });
  }
  
  /**
   * Create a rate limiter for sensitive operations
   * @param {number} limit - Maximum number of requests
   * @param {number} window - Time window in seconds
   * @returns {Function} Middleware function
   */
  forSensitiveOperation(limit = 20, window = 60) {
    return this.middleware({
      name: 'sensitive',
      limit,
      window
    });
  }
}

module.exports = new RateLimiter();
