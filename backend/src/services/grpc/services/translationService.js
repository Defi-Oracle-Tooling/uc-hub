/**
 * gRPC Translation Service Implementation
 * 
 * This module provides the implementation for translation-related gRPC methods.
 */

const grpc = require('@grpc/grpc-js');
const db = require('../../../database/postgresql');
const redis = require('../../../database/redis');
const { createSpan } = require('../../../middleware/monitoring/tracing');
const translationService = require('../../translation');

/**
 * Translate text
 * @param {Object} call - gRPC call object
 * @param {Function} callback - Callback function
 */
async function translateText(call, callback) {
  await createSpan('grpc.translationService.translateText', { 
    sourceLanguage: call.request.source_language,
    targetLanguage: call.request.target_language
  }, async () => {
    try {
      // Validate request
      if (!call.request.text || !call.request.target_language) {
        callback({
          code: grpc.status.INVALID_ARGUMENT,
          message: 'Missing required fields: text, target_language'
        });
        return;
      }
      
      const text = call.request.text;
      const sourceLanguage = call.request.source_language || null;
      const targetLanguage = call.request.target_language;
      
      // Check cache first
      const cacheKey = `translation:${sourceLanguage || 'auto'}:${targetLanguage}:${Buffer.from(text).toString('base64')}`;
      const cachedTranslation = await redis.get(cacheKey);
      
      if (cachedTranslation) {
        callback(null, cachedTranslation);
        return;
      }
      
      // Detect language if not provided
      let detectedLanguage = sourceLanguage;
      
      if (!detectedLanguage) {
        try {
          const detection = await translationService.detectLanguage(text);
          detectedLanguage = detection.language;
        } catch (error) {
          console.error('Error detecting language:', error);
          detectedLanguage = 'en'; // Default to English
        }
      }
      
      // Translate text
      const translatedText = await translationService.translateText(text, detectedLanguage, targetLanguage);
      
      // Format response
      const response = {
        translated_text: translatedText,
        detected_source_language: detectedLanguage
      };
      
      // Cache translation
      await redis.set(cacheKey, response, 3600); // Cache for 1 hour
      
      callback(null, response);
    } catch (error) {
      console.error('Error in translateText:', error);
      callback({
        code: grpc.status.INTERNAL,
        message: `Internal server error: ${error.message}`
      });
    }
  });
}

/**
 * Translate message
 * @param {Object} call - gRPC call object
 * @param {Function} callback - Callback function
 */
async function translateMessage(call, callback) {
  await createSpan('grpc.translationService.translateMessage', { 
    messageId: call.request.message_id,
    targetLanguage: call.request.target_language
  }, async () => {
    try {
      // Validate request
      if (!call.request.message_id || !call.request.target_language) {
        callback({
          code: grpc.status.INVALID_ARGUMENT,
          message: 'Missing required fields: message_id, target_language'
        });
        return;
      }
      
      const messageId = call.request.message_id;
      const targetLanguage = call.request.target_language;
      
      // Check if message exists
      const messageResult = await db.query(
        `SELECT m.id, m.content, m.original_language, m.sender_id, u.name as sender_name,
                m.timestamp, m.platform, c.platform_channel_id as channel_id,
                m.thread_id, m.is_edited, m.edit_timestamp, m.platform_message_id
         FROM messages m
         LEFT JOIN users u ON m.sender_id = u.id
         LEFT JOIN channels c ON m.channel_id = c.id
         WHERE m.id = $1`,
        [messageId]
      );
      
      if (messageResult.rows.length === 0) {
        callback({
          code: grpc.status.NOT_FOUND,
          message: `Message not found: ${messageId}`
        });
        return;
      }
      
      const message = messageResult.rows[0];
      
      // Check if translation already exists
      const translationResult = await db.query(
        `SELECT content
         FROM message_translations
         WHERE message_id = $1 AND language = $2`,
        [messageId, targetLanguage]
      );
      
      let translatedContent;
      
      if (translationResult.rows.length > 0) {
        // Use existing translation
        translatedContent = translationResult.rows[0].content;
      } else {
        // Translate message
        const sourceLanguage = message.original_language || 'en';
        
        // Skip translation if source and target languages are the same
        if (sourceLanguage === targetLanguage) {
          translatedContent = message.content;
        } else {
          translatedContent = await translationService.translateText(
            message.content,
            sourceLanguage,
            targetLanguage
          );
          
          // Store translation
          await db.query(
            `INSERT INTO message_translations (message_id, language, content)
             VALUES ($1, $2, $3)
             ON CONFLICT (message_id, language) DO UPDATE
             SET content = $3, updated_at = NOW()`,
            [messageId, targetLanguage, translatedContent]
          );
        }
      }
      
      // Get all translations
      const allTranslationsResult = await db.query(
        `SELECT language, content
         FROM message_translations
         WHERE message_id = $1`,
        [messageId]
      );
      
      const translations = {};
      
      for (const row of allTranslationsResult.rows) {
        translations[row.language] = row.content;
      }
      
      // Add the new translation
      translations[targetLanguage] = translatedContent;
      
      // Get attachments
      const attachmentsResult = await db.query(
        `SELECT id, type, url, name, size, mime_type
         FROM message_attachments
         WHERE message_id = $1`,
        [messageId]
      );
      
      // Get mentions
      const mentionsResult = await db.query(
        `SELECT user_id
         FROM message_mentions
         WHERE message_id = $1`,
        [messageId]
      );
      
      // Format message response
      const formattedMessage = {
        id: message.id,
        sender_id: message.sender_id,
        sender_name: message.sender_name || `User-${message.sender_id.substring(0, 8)}`,
        content: message.content,
        timestamp: message.timestamp.toISOString(),
        platform: message.platform,
        channel_id: message.channel_id,
        original_language: message.original_language || 'en',
        translations: translations,
        attachments: attachmentsResult.rows.map(att => ({
          id: att.id,
          type: att.type,
          url: att.url,
          name: att.name,
          size: att.size,
          mime_type: att.mime_type
        })),
        metadata: {
          platform_message_id: message.platform_message_id,
          thread_id: message.thread_id,
          is_edited: message.is_edited,
          edit_timestamp: message.edit_timestamp?.toISOString(),
          mentioned_user_ids: mentionsResult.rows.map(mention => mention.user_id),
          is_broadcast: false
        }
      };
      
      callback(null, formattedMessage);
    } catch (error) {
      console.error('Error in translateMessage:', error);
      callback({
        code: grpc.status.INTERNAL,
        message: `Internal server error: ${error.message}`
      });
    }
  });
}

/**
 * Detect language
 * @param {Object} call - gRPC call object
 * @param {Function} callback - Callback function
 */
async function detectLanguage(call, callback) {
  await createSpan('grpc.translationService.detectLanguage', {}, async () => {
    try {
      // Validate request
      if (!call.request.text) {
        callback({
          code: grpc.status.INVALID_ARGUMENT,
          message: 'Missing required field: text'
        });
        return;
      }
      
      const text = call.request.text;
      
      // Check cache first
      const cacheKey = `language-detection:${Buffer.from(text).toString('base64')}`;
      const cachedDetection = await redis.get(cacheKey);
      
      if (cachedDetection) {
        callback(null, cachedDetection);
        return;
      }
      
      // Detect language
      const detection = await translationService.detectLanguage(text);
      
      // Format response
      const response = {
        language: detection.language,
        confidence: detection.confidence
      };
      
      // Cache detection
      await redis.set(cacheKey, response, 3600); // Cache for 1 hour
      
      callback(null, response);
    } catch (error) {
      console.error('Error in detectLanguage:', error);
      callback({
        code: grpc.status.INTERNAL,
        message: `Internal server error: ${error.message}`
      });
    }
  });
}

module.exports = {
  translateText,
  translateMessage,
  detectLanguage
};
