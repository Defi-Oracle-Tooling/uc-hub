/**
 * gRPC User Service Implementation
 * 
 * This module provides the implementation for user-related gRPC methods.
 */

const grpc = require('@grpc/grpc-js');
const db = require('../../../database/postgresql');
const redis = require('../../../database/redis');
const { createSpan } = require('../../../middleware/monitoring/tracing');

/**
 * Get user information
 * @param {Object} call - gRPC call object
 * @param {Function} callback - Callback function
 */
async function getUser(call, callback) {
  await createSpan('grpc.userService.getUser', { userId: call.request.id }, async () => {
    try {
      // Check cache first
      const cacheKey = `user:${call.request.id}`;
      const cachedUser = await redis.get(cacheKey);
      
      if (cachedUser) {
        callback(null, cachedUser);
        return;
      }
      
      // Query database
      const result = await db.query(
        `SELECT u.id, u.name, u.email, u.avatar, u.status, u.last_seen, u.preferred_language, u.auto_translate
         FROM users u
         WHERE u.id = $1`,
        [call.request.id]
      );
      
      if (result.rows.length === 0) {
        callback({
          code: grpc.status.NOT_FOUND,
          message: `User not found: ${call.request.id}`
        });
        return;
      }
      
      // Get platform connections
      const connectionsResult = await db.query(
        `SELECT platform, platform_user_id, platform_username, is_connected, token_expires_at
         FROM user_platform_connections
         WHERE user_id = $1`,
        [call.request.id]
      );
      
      // Format user response
      const user = {
        id: result.rows[0].id,
        name: result.rows[0].name,
        email: result.rows[0].email,
        avatar: result.rows[0].avatar,
        status: result.rows[0].status,
        last_seen: result.rows[0].last_seen?.toISOString(),
        preferred_language: result.rows[0].preferred_language,
        auto_translate: result.rows[0].auto_translate,
        platform_connections: connectionsResult.rows.map(conn => ({
          platform: conn.platform,
          platform_user_id: conn.platform_user_id,
          platform_username: conn.platform_username,
          is_connected: conn.is_connected,
          token_expires_at: conn.token_expires_at?.toISOString()
        }))
      };
      
      // Cache user data
      await redis.set(cacheKey, user, 300); // Cache for 5 minutes
      
      callback(null, user);
    } catch (error) {
      console.error('Error in getUser:', error);
      callback({
        code: grpc.status.INTERNAL,
        message: `Internal server error: ${error.message}`
      });
    }
  });
}

/**
 * List users
 * @param {Object} call - gRPC call object
 * @param {Function} callback - Callback function
 */
async function listUsers(call, callback) {
  await createSpan('grpc.userService.listUsers', { 
    limit: call.request.limit,
    offset: call.request.offset
  }, async () => {
    try {
      const limit = call.request.limit || 50;
      const offset = call.request.offset || 0;
      const filter = call.request.filter || '';
      
      // Build query
      let query = `
        SELECT u.id, u.name, u.email, u.avatar, u.status, u.last_seen, u.preferred_language, u.auto_translate
        FROM users u
      `;
      
      const queryParams = [];
      
      if (filter) {
        query += ` WHERE u.name ILIKE $1 OR u.email ILIKE $1`;
        queryParams.push(`%${filter}%`);
      }
      
      // Get total count
      const countQuery = `SELECT COUNT(*) as total FROM (${query}) as filtered_users`;
      const countResult = await db.query(countQuery, queryParams);
      const totalCount = parseInt(countResult.rows[0].total);
      
      // Add pagination
      query += ` ORDER BY u.name LIMIT $${queryParams.length + 1} OFFSET $${queryParams.length + 2}`;
      queryParams.push(limit, offset);
      
      // Execute query
      const result = await db.query(query, queryParams);
      
      // Format response
      const users = result.rows.map(row => ({
        id: row.id,
        name: row.name,
        email: row.email,
        avatar: row.avatar,
        status: row.status,
        last_seen: row.last_seen?.toISOString(),
        preferred_language: row.preferred_language,
        auto_translate: row.auto_translate,
        platform_connections: []
      }));
      
      callback(null, {
        users,
        total_count: totalCount
      });
    } catch (error) {
      console.error('Error in listUsers:', error);
      callback({
        code: grpc.status.INTERNAL,
        message: `Internal server error: ${error.message}`
      });
    }
  });
}

/**
 * Update user status
 * @param {Object} call - gRPC call object
 * @param {Function} callback - Callback function
 */
async function updateUserStatus(call, callback) {
  await createSpan('grpc.userService.updateUserStatus', { 
    userId: call.request.user_id,
    status: call.request.status
  }, async () => {
    try {
      // Validate status
      const validStatuses = ['online', 'offline', 'away', 'busy', 'invisible'];
      
      if (!validStatuses.includes(call.request.status)) {
        callback({
          code: grpc.status.INVALID_ARGUMENT,
          message: `Invalid status: ${call.request.status}. Valid statuses are: ${validStatuses.join(', ')}`
        });
        return;
      }
      
      // Update user status
      const result = await db.query(
        `UPDATE users
         SET status = $1, last_seen = NOW(), updated_at = NOW()
         WHERE id = $2
         RETURNING id, name, email, avatar, status, last_seen, preferred_language, auto_translate`,
        [call.request.status, call.request.user_id]
      );
      
      if (result.rows.length === 0) {
        callback({
          code: grpc.status.NOT_FOUND,
          message: `User not found: ${call.request.user_id}`
        });
        return;
      }
      
      // Format user response
      const user = {
        id: result.rows[0].id,
        name: result.rows[0].name,
        email: result.rows[0].email,
        avatar: result.rows[0].avatar,
        status: result.rows[0].status,
        last_seen: result.rows[0].last_seen?.toISOString(),
        preferred_language: result.rows[0].preferred_language,
        auto_translate: result.rows[0].auto_translate,
        platform_connections: []
      };
      
      // Update cache
      const cacheKey = `user:${call.request.user_id}`;
      await redis.del(cacheKey);
      
      // Publish status update event
      await redis.publish('user:status', {
        userId: call.request.user_id,
        status: call.request.status,
        timestamp: new Date().toISOString()
      });
      
      callback(null, user);
    } catch (error) {
      console.error('Error in updateUserStatus:', error);
      callback({
        code: grpc.status.INTERNAL,
        message: `Internal server error: ${error.message}`
      });
    }
  });
}

module.exports = {
  getUser,
  listUsers,
  updateUserStatus
};
