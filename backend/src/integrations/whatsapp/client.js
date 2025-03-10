/**
 * WhatsApp Integration Client
 * 
 * This module provides integration with the WhatsApp Business API
 * for sending and receiving messages.
 */

const axios = require('axios');
const crypto = require('crypto');
const { messagesSent, messagesReceived } = require('../../middleware/monitoring/metrics');

class WhatsAppClient {
  constructor() {
    this.apiVersion = process.env.WHATSAPP_API_VERSION || 'v16.0';
    this.phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
    this.accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
    this.appSecret = process.env.WHATSAPP_APP_SECRET;
    this.webhookVerifyToken = process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN;
    this.baseUrl = `https://graph.facebook.com/${this.apiVersion}`;
  }
  
  /**
   * Verify webhook request from WhatsApp
   * @param {string} mode - The hub mode
   * @param {string} token - The verify token
   * @param {string} challenge - The challenge string
   * @returns {boolean|string} False if verification fails, challenge string if successful
   */
  verifyWebhook(mode, token, challenge) {
    if (mode === 'subscribe' && token === this.webhookVerifyToken) {
      return challenge;
    }
    return false;
  }
  
  /**
   * Verify the signature of a webhook request
   * @param {string} signature - The signature from the request header
   * @param {string} body - The raw request body
   * @returns {boolean} Whether the signature is valid
   */
  verifySignature(signature, body) {
    if (!this.appSecret || !signature) {
      return false;
    }
    
    const hmac = crypto.createHmac('sha256', this.appSecret);
    hmac.update(body);
    const expectedSignature = `sha256=${hmac.digest('hex')}`;
    
    return crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expectedSignature)
    );
  }
  
  /**
   * Process incoming webhook events from WhatsApp
   * @param {Object} body - The webhook request body
   * @returns {Array} Array of processed messages
   */
  processWebhook(body) {
    const messages = [];
    
    if (!body.object || body.object !== 'whatsapp_business_account') {
      return messages;
    }
    
    if (!body.entry || !Array.isArray(body.entry)) {
      return messages;
    }
    
    for (const entry of body.entry) {
      if (!entry.changes || !Array.isArray(entry.changes)) {
        continue;
      }
      
      for (const change of entry.changes) {
        if (change.field !== 'messages') {
          continue;
        }
        
        const value = change.value;
        
        if (!value || !value.messages || !Array.isArray(value.messages)) {
          continue;
        }
        
        for (const message of value.messages) {
          const processedMessage = this.formatIncomingMessage(message, value);
          
          if (processedMessage) {
            messages.push(processedMessage);
            
            // Increment metrics counter
            messagesReceived.inc({ platform: 'whatsapp' });
          }
        }
      }
    }
    
    return messages;
  }
  
  /**
   * Format an incoming message from WhatsApp
   * @param {Object} message - The message object from WhatsApp
   * @param {Object} value - The value object containing metadata
   * @returns {Object} Formatted message object
   */
  formatIncomingMessage(message, value) {
    if (!message.id || !message.from) {
      return null;
    }
    
    const messageData = {
      id: message.id,
      platform: 'whatsapp',
      externalUserId: message.from,
      timestamp: new Date(parseInt(message.timestamp) * 1000).toISOString(),
      metadata: {
        whatsappMessageId: message.id,
        whatsappBusinessAccountId: value.metadata?.business_account_id,
        whatsappPhoneNumberId: value.metadata?.phone_number_id
      }
    };
    
    // Handle different message types
    if (message.type === 'text' && message.text) {
      messageData.type = 'text';
      messageData.content = message.text.body;
    } else if (message.type === 'image' && message.image) {
      messageData.type = 'image';
      messageData.content = message.image.id;
      messageData.mediaUrl = message.image.link || null;
      messageData.caption = message.image.caption || null;
    } else if (message.type === 'audio' && message.audio) {
      messageData.type = 'audio';
      messageData.content = message.audio.id;
      messageData.mediaUrl = message.audio.link || null;
    } else if (message.type === 'video' && message.video) {
      messageData.type = 'video';
      messageData.content = message.video.id;
      messageData.mediaUrl = message.video.link || null;
      messageData.caption = message.video.caption || null;
    } else if (message.type === 'document' && message.document) {
      messageData.type = 'document';
      messageData.content = message.document.id;
      messageData.mediaUrl = message.document.link || null;
      messageData.filename = message.document.filename || null;
    } else if (message.type === 'location' && message.location) {
      messageData.type = 'location';
      messageData.content = JSON.stringify({
        latitude: message.location.latitude,
        longitude: message.location.longitude,
        name: message.location.name || null,
        address: message.location.address || null
      });
    } else if (message.type === 'contacts' && message.contacts) {
      messageData.type = 'contacts';
      messageData.content = JSON.stringify(message.contacts);
    } else {
      messageData.type = message.type || 'unknown';
      messageData.content = JSON.stringify(message);
    }
    
    return messageData;
  }
  
  /**
   * Send a message to WhatsApp
   * @param {string} to - The recipient's phone number
   * @param {Object} message - The message to send
   * @returns {Promise<Object>} The API response
   */
  async sendMessage(to, message) {
    if (!this.phoneNumberId || !this.accessToken) {
      throw new Error('WhatsApp credentials not configured');
    }
    
    const url = `${this.baseUrl}/${this.phoneNumberId}/messages`;
    
    try {
      const formattedMessage = this.formatOutgoingMessage(to, message);
      
      const response = await axios.post(url, formattedMessage, {
        headers: {
          'Authorization': `Bearer ${this.accessToken}`,
          'Content-Type': 'application/json'
        }
      });
      
      // Increment metrics counter
      messagesSent.inc({ platform: 'whatsapp' });
      
      return response.data;
    } catch (error) {
      console.error('Error sending WhatsApp message:', error.response?.data || error.message);
      throw new Error(`Failed to send WhatsApp message: ${error.message}`);
    }
  }
  
  /**
   * Format an outgoing message for WhatsApp
   * @param {string} to - The recipient's phone number
   * @param {Object} message - The message to format
   * @returns {Object} Formatted message for WhatsApp API
   */
  formatOutgoingMessage(to, message) {
    const formattedMessage = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to
    };
    
    switch (message.type) {
      case 'text':
        formattedMessage.type = 'text';
        formattedMessage.text = {
          body: message.content
        };
        break;
        
      case 'image':
        formattedMessage.type = 'image';
        if (message.mediaId) {
          formattedMessage.image = { id: message.mediaId };
        } else if (message.mediaUrl) {
          formattedMessage.image = { link: message.mediaUrl };
        }
        if (message.caption) {
          formattedMessage.image.caption = message.caption;
        }
        break;
        
      case 'audio':
        formattedMessage.type = 'audio';
        if (message.mediaId) {
          formattedMessage.audio = { id: message.mediaId };
        } else if (message.mediaUrl) {
          formattedMessage.audio = { link: message.mediaUrl };
        }
        break;
        
      case 'video':
        formattedMessage.type = 'video';
        if (message.mediaId) {
          formattedMessage.video = { id: message.mediaId };
        } else if (message.mediaUrl) {
          formattedMessage.video = { link: message.mediaUrl };
        }
        if (message.caption) {
          formattedMessage.video.caption = message.caption;
        }
        break;
        
      case 'document':
        formattedMessage.type = 'document';
        if (message.mediaId) {
          formattedMessage.document = { id: message.mediaId };
        } else if (message.mediaUrl) {
          formattedMessage.document = { link: message.mediaUrl };
        }
        if (message.filename) {
          formattedMessage.document.filename = message.filename;
        }
        break;
        
      case 'location':
        formattedMessage.type = 'location';
        formattedMessage.location = message.content;
        break;
        
      case 'template':
        formattedMessage.type = 'template';
        formattedMessage.template = {
          name: message.templateName,
          language: { code: message.languageCode || 'en_US' },
          components: message.components || []
        };
        break;
        
      case 'interactive':
        formattedMessage.type = 'interactive';
        formattedMessage.interactive = message.content;
        break;
        
      default:
        throw new Error(`Unsupported message type: ${message.type}`);
    }
    
    return formattedMessage;
  }
  
  /**
   * Upload media to WhatsApp
   * @param {Buffer} file - The file buffer
   * @param {string} type - The media type
   * @returns {Promise<Object>} The API response
   */
  async uploadMedia(file, type) {
    if (!this.phoneNumberId || !this.accessToken) {
      throw new Error('WhatsApp credentials not configured');
    }
    
    const url = `${this.baseUrl}/${this.phoneNumberId}/media`;
    
    const formData = new FormData();
    formData.append('file', new Blob([file]), 'file');
    formData.append('type', type);
    formData.append('messaging_product', 'whatsapp');
    
    try {
      const response = await axios.post(url, formData, {
        headers: {
          'Authorization': `Bearer ${this.accessToken}`,
          'Content-Type': 'multipart/form-data'
        }
      });
      
      return response.data;
    } catch (error) {
      console.error('Error uploading media to WhatsApp:', error.response?.data || error.message);
      throw new Error(`Failed to upload media to WhatsApp: ${error.message}`);
    }
  }
  
  /**
   * Get media URL from WhatsApp
   * @param {string} mediaId - The media ID
   * @returns {Promise<string>} The media URL
   */
  async getMediaUrl(mediaId) {
    if (!this.accessToken) {
      throw new Error('WhatsApp credentials not configured');
    }
    
    const url = `${this.baseUrl}/${mediaId}`;
    
    try {
      const response = await axios.get(url, {
        headers: {
          'Authorization': `Bearer ${this.accessToken}`
        }
      });
      
      return response.data.url;
    } catch (error) {
      console.error('Error getting media URL from WhatsApp:', error.response?.data || error.message);
      throw new Error(`Failed to get media URL from WhatsApp: ${error.message}`);
    }
  }
  
  /**
   * Download media from WhatsApp
   * @param {string} mediaId - The media ID
   * @returns {Promise<Buffer>} The media buffer
   */
  async downloadMedia(mediaId) {
    const mediaUrl = await this.getMediaUrl(mediaId);
    
    try {
      const response = await axios.get(mediaUrl, {
        headers: {
          'Authorization': `Bearer ${this.accessToken}`
        },
        responseType: 'arraybuffer'
      });
      
      return Buffer.from(response.data);
    } catch (error) {
      console.error('Error downloading media from WhatsApp:', error.response?.data || error.message);
      throw new Error(`Failed to download media from WhatsApp: ${error.message}`);
    }
  }
}

module.exports = new WhatsAppClient();
