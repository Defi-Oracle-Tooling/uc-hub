/**
 * gRPC Message Service Implementation
 * 
 * This module provides the implementation for message-related gRPC methods.
 */

const grpc = require('@grpc/grpc-js');
const db = require('../../../database/postgresql');
const redis = require('../../../database/redis');
const { createSpan } = require('../../../middleware/monitoring/tracing');
const { v4: uuidv4 } = require('uuid');

/**
 * Send a message
 * @param {Object} call - gRPC call object
 * @param {Function} callback - Callback function
 */
async function sendMessage(call, callback) {
  await createSpan('grpc.messageService.sendMessage', { 
    platform: call.request.platform,
    channelId: call.request.channel_id
  }, async () => {
    try {
      // Validate request
      if (!call.request.sender_id || !call.request.content || !call.request.platform || !call.request.channel_id) {
        callback({
          code: grpc.status.INVALID_ARGUMENT,
          message: 'Missing required fields: sender_id, content, platform, channel_id'
        });
        return;
      }
      
      // Check if channel exists
      const channelResult = await db.query(
        `SELECT id FROM channels WHERE platform = $1 AND platform_channel_id = $2`,
        [call.request.platform, call.request.channel_id]
      );
      
      let channelId;
      
      if (channelResult.rows.length === 0) {
        // Create channel if it doesn't exist
        const newChannelResult = await db.query(
          `INSERT INTO channels (name, platform, platform_channel_id, is_direct)
           VALUES ($1, $2, $3, $4)
           RETURNING id`,
          [
            `Channel-${call.request.platform}-${call.request.channel_id.substring(0, 8)}`,
            call.request.platform,
            call.request.channel_id,
            false
          ]
        );
        
        channelId = newChannelResult.rows[0].id;
      } else {
        channelId = channelResult.rows[0].id;
      }
      
      // Insert message
      const messageId = uuidv4();
      const threadId = call.request.metadata?.thread_id || null;
      
      const messageResult = await db.query(
        `INSERT INTO messages (
           id, channel_id, sender_id, content, timestamp, platform, 
           platform_message_id, original_language, thread_id, is_edited
         )
         VALUES ($1, $2, $3, $4, NOW(), $5, $6, $7, $8, false)
         RETURNING id, content, timestamp, platform, thread_id, is_edited, edit_timestamp`,
        [
          messageId,
          channelId,
          call.request.sender_id,
          call.request.content,
          call.request.platform,
          call.request.metadata?.platform_message_id || null,
          'en', // Default language, can be updated later
          threadId
        ]
      );
      
      // Get sender information
      const senderResult = await db.query(
        `SELECT name FROM users WHERE id = $1`,
        [call.request.sender_id]
      );
      
      const senderName = senderResult.rows.length > 0 
        ? senderResult.rows[0].name 
        : `User-${call.request.sender_id.substring(0, 8)}`;
      
      // Process attachments if any
      if (call.request.attachments && call.request.attachments.length > 0) {
        for (const attachment of call.request.attachments) {
          await db.query(
            `INSERT INTO message_attachments (message_id, type, url, name, size, mime_type)
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [
              messageId,
              attachment.type,
              attachment.url,
              attachment.name,
              attachment.size || 0,
              attachment.mime_type
            ]
          );
        }
      }
      
      // Process mentions if any
      if (call.request.metadata?.mentioned_user_ids && call.request.metadata.mentioned_user_ids.length > 0) {
        for (const userId of call.request.metadata.mentioned_user_ids) {
          await db.query(
            `INSERT INTO message_mentions (message_id, user_id)
             VALUES ($1, $2)`,
            [messageId, userId]
          );
        }
      }
      
      // Get attachments
      const attachmentsResult = await db.query(
        `SELECT id, type, url, name, size, mime_type
         FROM message_attachments
         WHERE message_id = $1`,
        [messageId]
      );
      
      // Format message response
      const message = {
        id: messageResult.rows[0].id,
        sender_id: call.request.sender_id,
        sender_name: senderName,
        content: messageResult.rows[0].content,
        timestamp: messageResult.rows[0].timestamp.toISOString(),
        platform: messageResult.rows[0].platform,
        channel_id: call.request.channel_id,
        original_language: 'en',
        translations: {},
        attachments: attachmentsResult.rows.map(att => ({
          id: att.id,
          type: att.type,
          url: att.url,
          name: att.name,
          size: att.size,
          mime_type: att.mime_type
        })),
        metadata: {
          platform_message_id: call.request.metadata?.platform_message_id,
          thread_id: messageResult.rows[0].thread_id,
          is_edited: messageResult.rows[0].is_edited,
          edit_timestamp: messageResult.rows[0].edit_timestamp?.toISOString(),
          mentioned_user_ids: call.request.metadata?.mentioned_user_ids || [],
          is_broadcast: call.request.metadata?.is_broadcast || false
        }
      };
      
      // Publish message event
      await redis.publish('message:new', {
        messageId,
        channelId,
        senderId: call.request.sender_id,
        platform: call.request.platform,
        timestamp: new Date().toISOString()
      });
      
      callback(null, message);
    } catch (error) {
      console.error('Error in sendMessage:', error);
      callback({
        code: grpc.status.INTERNAL,
        message: `Internal server error: ${error.message}`
      });
    }
  });
}

/**
 * Get messages
 * @param {Object} call - gRPC call object
 * @param {Function} callback - Callback function
 */
async function getMessages(call, callback) {
  await createSpan('grpc.messageService.getMessages', { 
    platform: call.request.platform,
    channelId: call.request.channel_id
  }, async () => {
    try {
      // Validate request
      if (!call.request.platform || !call.request.channel_id) {
        callback({
          code: grpc.status.INVALID_ARGUMENT,
          message: 'Missing required fields: platform, channel_id'
        });
        return;
      }
      
      const limit = call.request.limit || 50;
      const beforeTimestamp = call.request.before_timestamp ? new Date(call.request.before_timestamp) : null;
      const afterTimestamp = call.request.after_timestamp ? new Date(call.request.after_timestamp) : null;
      const threadId = call.request.thread_id || null;
      
      // Get channel ID
      const channelResult = await db.query(
        `SELECT id FROM channels WHERE platform = $1 AND platform_channel_id = $2`,
        [call.request.platform, call.request.channel_id]
      );
      
      if (channelResult.rows.length === 0) {
        callback(null, { messages: [], has_more: false });
        return;
      }
      
      const channelId = channelResult.rows[0].id;
      
      // Build query
      let query = `
        SELECT m.id, m.sender_id, u.name as sender_name, m.content, m.timestamp, m.platform,
               m.original_language, m.thread_id, m.is_edited, m.edit_timestamp,
               m.platform_message_id
        FROM messages m
        LEFT JOIN users u ON m.sender_id = u.id
        WHERE m.channel_id = $1
      `;
      
      const queryParams = [channelId];
      let paramIndex = 2;
      
      if (threadId) {
        query += ` AND m.thread_id = $${paramIndex}`;
        queryParams.push(threadId);
        paramIndex++;
      } else {
        query += ` AND m.thread_id IS NULL`;
      }
      
      if (beforeTimestamp) {
        query += ` AND m.timestamp < $${paramIndex}`;
        queryParams.push(beforeTimestamp);
        paramIndex++;
      }
      
      if (afterTimestamp) {
        query += ` AND m.timestamp > $${paramIndex}`;
        queryParams.push(afterTimestamp);
        paramIndex++;
      }
      
      // Add one more than requested to check if there are more messages
      query += ` ORDER BY m.timestamp DESC LIMIT $${paramIndex}`;
      queryParams.push(limit + 1);
      
      // Execute query
      const result = await db.query(query, queryParams);
      
      // Check if there are more messages
      const hasMore = result.rows.length > limit;
      const messages = result.rows.slice(0, limit);
      
      // Get attachments for all messages
      const messageIds = messages.map(msg => msg.id);
      
      let attachments = [];
      let translations = [];
      let mentions = [];
      
      if (messageIds.length > 0) {
        // Get attachments
        const attachmentsResult = await db.query(
          `SELECT message_id, id, type, url, name, size, mime_type
           FROM message_attachments
           WHERE message_id = ANY($1)`,
          [messageIds]
        );
        
        attachments = attachmentsResult.rows;
        
        // Get translations
        const translationsResult = await db.query(
          `SELECT message_id, language, content
           FROM message_translations
           WHERE message_id = ANY($1)`,
          [messageIds]
        );
        
        translations = translationsResult.rows;
        
        // Get mentions
        const mentionsResult = await db.query(
          `SELECT message_id, user_id
           FROM message_mentions
           WHERE message_id = ANY($1)`,
          [messageIds]
        );
        
        mentions = mentionsResult.rows;
      }
      
      // Format messages
      const formattedMessages = messages.map(msg => {
        // Get attachments for this message
        const messageAttachments = attachments
          .filter(att => att.message_id === msg.id)
          .map(att => ({
            id: att.id,
            type: att.type,
            url: att.url,
            name: att.name,
            size: att.size,
            mime_type: att.mime_type
          }));
        
        // Get translations for this message
        const messageTranslations = translations
          .filter(trans => trans.message_id === msg.id)
          .reduce((acc, trans) => {
            acc[trans.language] = trans.content;
            return acc;
          }, {});
        
        // Get mentions for this message
        const messageMentions = mentions
          .filter(mention => mention.message_id === msg.id)
          .map(mention => mention.user_id);
        
        return {
          id: msg.id,
          sender_id: msg.sender_id,
          sender_name: msg.sender_name || `User-${msg.sender_id.substring(0, 8)}`,
          content: msg.content,
          timestamp: msg.timestamp.toISOString(),
          platform: msg.platform,
          channel_id: call.request.channel_id,
          original_language: msg.original_language || 'en',
          translations: messageTranslations,
          attachments: messageAttachments,
          metadata: {
            platform_message_id: msg.platform_message_id,
            thread_id: msg.thread_id,
            is_edited: msg.is_edited,
            edit_timestamp: msg.edit_timestamp?.toISOString(),
            mentioned_user_ids: messageMentions,
            is_broadcast: false
          }
        };
      });
      
      callback(null, {
        messages: formattedMessages,
        has_more: hasMore
      });
    } catch (error) {
      console.error('Error in getMessages:', error);
      callback({
        code: grpc.status.INTERNAL,
        message: `Internal server error: ${error.message}`
      });
    }
  });
}

/**
 * Stream messages
 * @param {Object} call - gRPC call object
 */
async function streamMessages(call) {
  const userId = call.request.user_id;
  const platforms = call.request.platforms || [];
  const channelIds = call.request.channel_ids || [];
  
  if (!userId) {
    call.emit('error', {
      code: grpc.status.INVALID_ARGUMENT,
      message: 'Missing required field: user_id'
    });
    call.end();
    return;
  }
  
  // Subscribe to message events
  const messageHandler = async (data) => {
    try {
      // Check if the message is from a requested platform
      if (platforms.length > 0 && !platforms.includes(data.platform)) {
        return;
      }
      
      // Check if the message is from a requested channel
      if (channelIds.length > 0) {
        const channelResult = await db.query(
          `SELECT platform_channel_id FROM channels WHERE id = $1`,
          [data.channelId]
        );
        
        if (channelResult.rows.length === 0 || !channelIds.includes(channelResult.rows[0].platform_channel_id)) {
          return;
        }
      }
      
      // Get message details
      const messageResult = await db.query(
        `SELECT m.id, m.sender_id, u.name as sender_name, m.content, m.timestamp, m.platform,
                m.original_language, m.thread_id, m.is_edited, m.edit_timestamp,
                m.platform_message_id, c.platform_channel_id as channel_id
         FROM messages m
         LEFT JOIN users u ON m.sender_id = u.id
         LEFT JOIN channels c ON m.channel_id = c.id
         WHERE m.id = $1`,
        [data.messageId]
      );
      
      if (messageResult.rows.length === 0) {
        return;
      }
      
      const msg = messageResult.rows[0];
      
      // Get attachments
      const attachmentsResult = await db.query(
        `SELECT id, type, url, name, size, mime_type
         FROM message_attachments
         WHERE message_id = $1`,
        [msg.id]
      );
      
      // Get translations
      const translationsResult = await db.query(
        `SELECT language, content
         FROM message_translations
         WHERE message_id = $1`,
        [msg.id]
      );
      
      // Get mentions
      const mentionsResult = await db.query(
        `SELECT user_id
         FROM message_mentions
         WHERE message_id = $1`,
        [msg.id]
      );
      
      // Format message
      const message = {
        id: msg.id,
        sender_id: msg.sender_id,
        sender_name: msg.sender_name || `User-${msg.sender_id.substring(0, 8)}`,
        content: msg.content,
        timestamp: msg.timestamp.toISOString(),
        platform: msg.platform,
        channel_id: msg.channel_id,
        original_language: msg.original_language || 'en',
        translations: translationsResult.rows.reduce((acc, trans) => {
          acc[trans.language] = trans.content;
          return acc;
        }, {}),
        attachments: attachmentsResult.rows.map(att => ({
          id: att.id,
          type: att.type,
          url: att.url,
          name: att.name,
          size: att.size,
          mime_type: att.mime_type
        })),
        metadata: {
          platform_message_id: msg.platform_message_id,
          thread_id: msg.thread_id,
          is_edited: msg.is_edited,
          edit_timestamp: msg.edit_timestamp?.toISOString(),
          mentioned_user_ids: mentionsResult.rows.map(mention => mention.user_id),
          is_broadcast: false
        }
      };
      
      // Send message to client
      call.write(message);
    } catch (error) {
      console.error('Error in streamMessages handler:', error);
    }
  };
  
  // Subscribe to Redis channel
  await redis.subscribe('message:new', messageHandler);
  
  // Handle client disconnect
  call.on('cancelled', async () => {
    await redis.unsubscribe('message:new');
  });
  
  call.on('error', async (error) => {
    console.error('Stream error:', error);
    await redis.unsubscribe('message:new');
  });
  
  call.on('end', async () => {
    await redis.unsubscribe('message:new');
  });
}

module.exports = {
  sendMessage,
  getMessages,
  streamMessages
};
