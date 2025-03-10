/**
 * gRPC Platform Service Implementation
 * 
 * This module provides the implementation for platform integration-related gRPC methods.
 */

const grpc = require('@grpc/grpc-js');
const db = require('../../../database/postgresql');
const redis = require('../../../database/redis');
const { createSpan } = require('../../../middleware/monitoring/tracing');

// Import platform clients
const whatsappClient = require('../../../integrations/whatsapp/client');
const zoomClient = require('../../../integrations/zoom/client');
const googleMeetClient = require('../../../integrations/google-meet/client');
const smsClient = require('../../../integrations/sms/client');

/**
 * Connect platform
 * @param {Object} call - gRPC call object
 * @param {Function} callback - Callback function
 */
async function connectPlatform(call, callback) {
  await createSpan('grpc.platformService.connectPlatform', { 
    userId: call.request.user_id,
    platform: call.request.platform
  }, async () => {
    try {
      // Validate request
      if (!call.request.user_id || !call.request.platform || !call.request.auth_code) {
        callback({
          code: grpc.status.INVALID_ARGUMENT,
          message: 'Missing required fields: user_id, platform, auth_code'
        });
        return;
      }
      
      const userId = call.request.user_id;
      const platform = call.request.platform.toLowerCase();
      const authCode = call.request.auth_code;
      const redirectUri = call.request.redirect_uri || '';
      
      // Validate platform
      const validPlatforms = ['whatsapp', 'zoom', 'google_meet', 'teams', 'sms'];
      
      if (!validPlatforms.includes(platform)) {
        callback({
          code: grpc.status.INVALID_ARGUMENT,
          message: `Invalid platform: ${platform}. Valid platforms are: ${validPlatforms.join(', ')}`
        });
        return;
      }
      
      // Check if user exists
      const userResult = await db.query(
        `SELECT id FROM users WHERE id = $1`,
        [userId]
      );
      
      if (userResult.rows.length === 0) {
        callback({
          code: grpc.status.NOT_FOUND,
          message: `User not found: ${userId}`
        });
        return;
      }
      
      // Connect to platform
      let platformConnection;
      
      switch (platform) {
        case 'whatsapp':
          platformConnection = await connectWhatsapp(userId, authCode, redirectUri);
          break;
        case 'zoom':
          platformConnection = await connectZoom(userId, authCode, redirectUri);
          break;
        case 'google_meet':
          platformConnection = await connectGoogleMeet(userId, authCode, redirectUri);
          break;
        case 'teams':
          platformConnection = await connectTeams(userId, authCode, redirectUri);
          break;
        case 'sms':
          platformConnection = await connectSMS(userId, authCode, redirectUri);
          break;
        default:
          callback({
            code: grpc.status.UNIMPLEMENTED,
            message: `Platform not implemented: ${platform}`
          });
          return;
      }
      
      // Format response
      const response = {
        success: true,
        message: `Successfully connected to ${platform}`,
        connection: platformConnection
      };
      
      // Publish platform connected event
      await redis.publish('platform:connected', {
        userId,
        platform,
        timestamp: new Date().toISOString()
      });
      
      callback(null, response);
    } catch (error) {
      console.error('Error in connectPlatform:', error);
      callback({
        code: grpc.status.INTERNAL,
        message: `Internal server error: ${error.message}`
      });
    }
  });
}

/**
 * Connect to WhatsApp
 * @param {string} userId - User ID
 * @param {string} authCode - Authorization code
 * @param {string} redirectUri - Redirect URI
 * @returns {Promise<Object>} Platform connection
 */
async function connectWhatsapp(userId, authCode, redirectUri) {
  try {
    // Exchange auth code for tokens
    const authResult = await whatsappClient.exchangeAuthCode(authCode, redirectUri);
    
    // Get user info
    const userInfo = await whatsappClient.getUserInfo(authResult.accessToken);
    
    // Store connection in database
    const result = await db.query(
      `INSERT INTO user_platform_connections (
         user_id, platform, platform_user_id, platform_username,
         access_token, refresh_token, token_expires_at, is_connected
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (user_id, platform) DO UPDATE
       SET platform_user_id = $3, platform_username = $4,
           access_token = $5, refresh_token = $6,
           token_expires_at = $7, is_connected = $8,
           updated_at = NOW()
       RETURNING platform, platform_user_id, platform_username, is_connected, token_expires_at`,
      [
        userId,
        'whatsapp',
        userInfo.id,
        userInfo.phoneNumber,
        authResult.accessToken,
        authResult.refreshToken,
        new Date(Date.now() + authResult.expiresIn * 1000),
        true
      ]
    );
    
    return {
      platform: result.rows[0].platform,
      platform_user_id: result.rows[0].platform_user_id,
      platform_username: result.rows[0].platform_username,
      is_connected: result.rows[0].is_connected,
      token_expires_at: result.rows[0].token_expires_at.toISOString()
    };
  } catch (error) {
    console.error('Error connecting to WhatsApp:', error);
    throw new Error(`Failed to connect to WhatsApp: ${error.message}`);
  }
}

/**
 * Connect to Zoom
 * @param {string} userId - User ID
 * @param {string} authCode - Authorization code
 * @param {string} redirectUri - Redirect URI
 * @returns {Promise<Object>} Platform connection
 */
async function connectZoom(userId, authCode, redirectUri) {
  try {
    // Exchange auth code for tokens
    const authResult = await zoomClient.exchangeAuthCode(authCode, redirectUri);
    
    // Get user info
    const userInfo = await zoomClient.getUserInfo(authResult.accessToken);
    
    // Store connection in database
    const result = await db.query(
      `INSERT INTO user_platform_connections (
         user_id, platform, platform_user_id, platform_username,
         access_token, refresh_token, token_expires_at, is_connected
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (user_id, platform) DO UPDATE
       SET platform_user_id = $3, platform_username = $4,
           access_token = $5, refresh_token = $6,
           token_expires_at = $7, is_connected = $8,
           updated_at = NOW()
       RETURNING platform, platform_user_id, platform_username, is_connected, token_expires_at`,
      [
        userId,
        'zoom',
        userInfo.id,
        userInfo.email,
        authResult.accessToken,
        authResult.refreshToken,
        new Date(Date.now() + authResult.expiresIn * 1000),
        true
      ]
    );
    
    return {
      platform: result.rows[0].platform,
      platform_user_id: result.rows[0].platform_user_id,
      platform_username: result.rows[0].platform_username,
      is_connected: result.rows[0].is_connected,
      token_expires_at: result.rows[0].token_expires_at.toISOString()
    };
  } catch (error) {
    console.error('Error connecting to Zoom:', error);
    throw new Error(`Failed to connect to Zoom: ${error.message}`);
  }
}

/**
 * Connect to Google Meet
 * @param {string} userId - User ID
 * @param {string} authCode - Authorization code
 * @param {string} redirectUri - Redirect URI
 * @returns {Promise<Object>} Platform connection
 */
async function connectGoogleMeet(userId, authCode, redirectUri) {
  try {
    // Exchange auth code for tokens
    const authResult = await googleMeetClient.exchangeAuthCode(authCode, redirectUri);
    
    // Get user info
    const userInfo = await googleMeetClient.getUserInfo(authResult.accessToken);
    
    // Store connection in database
    const result = await db.query(
      `INSERT INTO user_platform_connections (
         user_id, platform, platform_user_id, platform_username,
         access_token, refresh_token, token_expires_at, is_connected
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (user_id, platform) DO UPDATE
       SET platform_user_id = $3, platform_username = $4,
           access_token = $5, refresh_token = $6,
           token_expires_at = $7, is_connected = $8,
           updated_at = NOW()
       RETURNING platform, platform_user_id, platform_username, is_connected, token_expires_at`,
      [
        userId,
        'google_meet',
        userInfo.id,
        userInfo.email,
        authResult.accessToken,
        authResult.refreshToken,
        new Date(Date.now() + authResult.expiresIn * 1000),
        true
      ]
    );
    
    return {
      platform: result.rows[0].platform,
      platform_user_id: result.rows[0].platform_user_id,
      platform_username: result.rows[0].platform_username,
      is_connected: result.rows[0].is_connected,
      token_expires_at: result.rows[0].token_expires_at.toISOString()
    };
  } catch (error) {
    console.error('Error connecting to Google Meet:', error);
    throw new Error(`Failed to connect to Google Meet: ${error.message}`);
  }
}

/**
 * Connect to Microsoft Teams
 * @param {string} userId - User ID
 * @param {string} authCode - Authorization code
 * @param {string} redirectUri - Redirect URI
 * @returns {Promise<Object>} Platform connection
 */
async function connectTeams(userId, authCode, redirectUri) {
  // Teams integration is not implemented yet
  throw new Error('Microsoft Teams integration is not implemented yet');
}

/**
 * Connect to SMS
 * @param {string} userId - User ID
 * @param {string} authCode - Authorization code
 * @param {string} redirectUri - Redirect URI
 * @returns {Promise<Object>} Platform connection
 */
async function connectSMS(userId, authCode, redirectUri) {
  try {
    // For SMS, the auth code is the phone number
    const phoneNumber = authCode;
    
    // Store connection in database
    const result = await db.query(
      `INSERT INTO user_platform_connections (
         user_id, platform, platform_user_id, platform_username,
         is_connected
       )
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (user_id, platform) DO UPDATE
       SET platform_user_id = $3, platform_username = $4,
           is_connected = $5, updated_at = NOW()
       RETURNING platform, platform_user_id, platform_username, is_connected, token_expires_at`,
      [
        userId,
        'sms',
        phoneNumber,
        phoneNumber,
        true
      ]
    );
    
    return {
      platform: result.rows[0].platform,
      platform_user_id: result.rows[0].platform_user_id,
      platform_username: result.rows[0].platform_username,
      is_connected: result.rows[0].is_connected,
      token_expires_at: result.rows[0].token_expires_at?.toISOString()
    };
  } catch (error) {
    console.error('Error connecting to SMS:', error);
    throw new Error(`Failed to connect to SMS: ${error.message}`);
  }
}

/**
 * Disconnect platform
 * @param {Object} call - gRPC call object
 * @param {Function} callback - Callback function
 */
async function disconnectPlatform(call, callback) {
  await createSpan('grpc.platformService.disconnectPlatform', { 
    userId: call.request.user_id,
    platform: call.request.platform
  }, async () => {
    try {
      // Validate request
      if (!call.request.user_id || !call.request.platform) {
        callback({
          code: grpc.status.INVALID_ARGUMENT,
          message: 'Missing required fields: user_id, platform'
        });
        return;
      }
      
      const userId = call.request.user_id;
      const platform = call.request.platform.toLowerCase();
      
      // Validate platform
      const validPlatforms = ['whatsapp', 'zoom', 'google_meet', 'teams', 'sms'];
      
      if (!validPlatforms.includes(platform)) {
        callback({
          code: grpc.status.INVALID_ARGUMENT,
          message: `Invalid platform: ${platform}. Valid platforms are: ${validPlatforms.join(', ')}`
        });
        return;
      }
      
      // Check if connection exists
      const connectionResult = await db.query(
        `SELECT id, access_token
         FROM user_platform_connections
         WHERE user_id = $1 AND platform = $2`,
        [userId, platform]
      );
      
      if (connectionResult.rows.length === 0) {
        callback({
          code: grpc.status.NOT_FOUND,
          message: `Platform connection not found: ${platform}`
        });
        return;
      }
      
      // Revoke access token if available
      if (connectionResult.rows[0].access_token) {
        try {
          switch (platform) {
            case 'whatsapp':
              await whatsappClient.revokeToken(connectionResult.rows[0].access_token);
              break;
            case 'zoom':
              await zoomClient.revokeToken(connectionResult.rows[0].access_token);
              break;
            case 'google_meet':
              await googleMeetClient.revokeToken(connectionResult.rows[0].access_token);
              break;
            // Teams and SMS don't need token revocation
          }
        } catch (error) {
          console.warn(`Error revoking ${platform} token:`, error);
          // Continue with disconnection even if token revocation fails
        }
      }
      
      // Update connection in database
      await db.query(
        `UPDATE user_platform_connections
         SET is_connected = false, access_token = NULL, refresh_token = NULL,
             token_expires_at = NULL, updated_at = NOW()
         WHERE user_id = $1 AND platform = $2`,
        [userId, platform]
      );
      
      // Publish platform disconnected event
      await redis.publish('platform:disconnected', {
        userId,
        platform,
        timestamp: new Date().toISOString()
      });
      
      callback(null, {
        success: true,
        message: `Successfully disconnected from ${platform}`
      });
    } catch (error) {
      console.error('Error in disconnectPlatform:', error);
      callback({
        code: grpc.status.INTERNAL,
        message: `Internal server error: ${error.message}`
      });
    }
  });
}

/**
 * Get platform status
 * @param {Object} call - gRPC call object
 * @param {Function} callback - Callback function
 */
async function getPlatformStatus(call, callback) {
  await createSpan('grpc.platformService.getPlatformStatus', { 
    userId: call.request.user_id
  }, async () => {
    try {
      // Validate request
      if (!call.request.user_id) {
        callback({
          code: grpc.status.INVALID_ARGUMENT,
          message: 'Missing required field: user_id'
        });
        return;
      }
      
      const userId = call.request.user_id;
      const platforms = call.request.platforms || [];
      
      // Get all platform connections for the user
      let query = `
        SELECT platform, platform_user_id, platform_username, is_connected, token_expires_at
        FROM user_platform_connections
        WHERE user_id = $1
      `;
      
      const queryParams = [userId];
      
      if (platforms.length > 0) {
        query += ` AND platform = ANY($2)`;
        queryParams.push(platforms);
      }
      
      const connectionsResult = await db.query(query, queryParams);
      
      // Format response
      const platformStatuses = [];
      
      for (const connection of connectionsResult.rows) {
        // Check if token is expired
        const isTokenExpired = connection.token_expires_at && new Date() > new Date(connection.token_expires_at);
        
        // Get unread count
        const unreadCount = await getUnreadCount(userId, connection.platform);
        
        platformStatuses.push({
          platform: connection.platform,
          is_connected: connection.is_connected && !isTokenExpired,
          status_message: isTokenExpired ? 'Token expired' : (connection.is_connected ? 'Connected' : 'Disconnected'),
          unread_count: unreadCount
        });
      }
      
      // Add requested platforms that are not connected
      if (platforms.length > 0) {
        const connectedPlatforms = platformStatuses.map(status => status.platform);
        
        for (const platform of platforms) {
          if (!connectedPlatforms.includes(platform)) {
            platformStatuses.push({
              platform,
              is_connected: false,
              status_message: 'Not connected',
              unread_count: 0
            });
          }
        }
      }
      
      callback(null, {
        platform_statuses: platformStatuses
      });
    } catch (error) {
      console.error('Error in getPlatformStatus:', error);
      callback({
        code: grpc.status.INTERNAL,
        message: `Internal server error: ${error.message}`
      });
    }
  });
}

/**
 * Get unread count for a platform
 * @param {string} userId - User ID
 * @param {string} platform - Platform name
 * @returns {Promise<number>} Unread count
 */
async function getUnreadCount(userId, platform) {
  try {
    // Get channels for the platform
    const channelsResult = await db.query(
      `SELECT c.id
       FROM channels c
       JOIN channel_members cm ON c.id = cm.channel_id
       WHERE cm.user_id = $1 AND c.platform = $2`,
      [userId, platform]
    );
    
    if (channelsResult.rows.length === 0) {
      return 0;
    }
    
    const channelIds = channelsResult.rows.map(row => row.id);
    
    // Get unread messages count
    const unreadResult = await db.query(
      `SELECT COUNT(*) as unread_count
       FROM messages m
       LEFT JOIN message_read_status mrs ON m.id = mrs.message_id AND mrs.user_id = $1
       WHERE m.channel_id = ANY($2)
         AND m.sender_id != $1
         AND (mrs.is_read IS NULL OR mrs.is_read = false)`,
      [userId, channelIds]
    );
    
    return parseInt(unreadResult.rows[0].unread_count);
  } catch (error) {
    console.error('Error getting unread count:', error);
    return 0;
  }
}

module.exports = {
  connectPlatform,
  disconnectPlatform,
  getPlatformStatus
};
