/**
 * SMS Integration Client
 * 
 * This module provides integration with Twilio and Vonage (formerly Nexmo)
 * for sending and receiving SMS messages.
 */

const twilio = require('twilio');
const Vonage = require('@vonage/server-sdk');
const crypto = require('crypto');
const { messagesSent, messagesReceived } = require('../../middleware/monitoring/metrics');

class SMSClient {
  constructor() {
    // Twilio configuration
    this.twilioAccountSid = process.env.TWILIO_ACCOUNT_SID;
    this.twilioAuthToken = process.env.TWILIO_AUTH_TOKEN;
    this.twilioPhoneNumber = process.env.TWILIO_PHONE_NUMBER;
    this.twilioWebhookSecret = process.env.TWILIO_WEBHOOK_SECRET;
    
    // Vonage configuration
    this.vonageApiKey = process.env.VONAGE_API_KEY;
    this.vonageApiSecret = process.env.VONAGE_API_SECRET;
    this.vonagePhoneNumber = process.env.VONAGE_PHONE_NUMBER;
    this.vonageSignatureSecret = process.env.VONAGE_SIGNATURE_SECRET;
    
    // Default provider
    this.defaultProvider = process.env.SMS_DEFAULT_PROVIDER || 'twilio';
    
    // Initialize clients
    this.initializeClients();
  }
  
  /**
   * Initialize SMS provider clients
   */
  initializeClients() {
    // Initialize Twilio client if credentials are available
    if (this.twilioAccountSid && this.twilioAuthToken) {
      this.twilioClient = twilio(this.twilioAccountSid, this.twilioAuthToken);
    }
    
    // Initialize Vonage client if credentials are available
    if (this.vonageApiKey && this.vonageApiSecret) {
      this.vonageClient = new Vonage({
        apiKey: this.vonageApiKey,
        apiSecret: this.vonageApiSecret
      });
    }
  }
  
  /**
   * Verify Twilio webhook request
   * @param {string} signature - The X-Twilio-Signature header
   * @param {string} url - The full URL of the webhook
   * @param {Object} params - The request parameters
   * @returns {boolean} Whether the signature is valid
   */
  verifyTwilioWebhook(signature, url, params) {
    if (!this.twilioAuthToken) {
      return false;
    }
    
    return twilio.validateRequest(
      this.twilioAuthToken,
      signature,
      url,
      params
    );
  }
  
  /**
   * Verify Vonage webhook request
   * @param {Object} params - The request parameters
   * @param {string} signature - The signature from the request
   * @returns {boolean} Whether the signature is valid
   */
  verifyVonageWebhook(params, signature) {
    if (!this.vonageSignatureSecret) {
      return false;
    }
    
    // Sort the params alphabetically
    const sortedParams = {};
    Object.keys(params).sort().forEach(key => {
      sortedParams[key] = params[key];
    });
    
    // Create the signature string
    let signatureData = '';
    Object.keys(sortedParams).forEach(key => {
      signatureData += `&${key}=${sortedParams[key]}`;
    });
    signatureData = signatureData.substring(1); // Remove the first &
    
    // Create the HMAC
    const hmac = crypto.createHmac('sha256', this.vonageSignatureSecret);
    hmac.update(signatureData);
    const calculatedSignature = hmac.digest('hex');
    
    return calculatedSignature === signature;
  }
  
  /**
   * Process incoming webhook events from Twilio
   * @param {Object} body - The webhook request body
   * @returns {Object} Processed message object
   */
  processTwilioWebhook(body) {
    if (!body.MessageSid || !body.From || !body.Body) {
      return null;
    }
    
    const message = {
      id: body.MessageSid,
      platform: 'sms',
      provider: 'twilio',
      externalUserId: body.From,
      to: body.To,
      content: body.Body,
      timestamp: new Date().toISOString(),
      type: 'text',
      metadata: {
        accountSid: body.AccountSid,
        messageSid: body.MessageSid,
        numMedia: body.NumMedia || '0',
        fromCity: body.FromCity,
        fromState: body.FromState,
        fromCountry: body.FromCountry
      }
    };
    
    // Handle media if present
    if (body.NumMedia && parseInt(body.NumMedia) > 0) {
      message.media = [];
      
      for (let i = 0; i < parseInt(body.NumMedia); i++) {
        message.media.push({
          url: body[`MediaUrl${i}`],
          contentType: body[`MediaContentType${i}`]
        });
      }
      
      message.type = 'media';
    }
    
    // Increment metrics counter
    messagesReceived.inc({ platform: 'sms' });
    
    return message;
  }
  
  /**
   * Process incoming webhook events from Vonage
   * @param {Object} body - The webhook request body
   * @returns {Object} Processed message object
   */
  processVonageWebhook(body) {
    // Vonage sends an array of messages
    if (!Array.isArray(body)) {
      return null;
    }
    
    const messages = [];
    
    for (const item of body) {
      if (!item.messageId || !item.msisdn || !item.text) {
        continue;
      }
      
      const message = {
        id: item.messageId,
        platform: 'sms',
        provider: 'vonage',
        externalUserId: item.msisdn,
        to: item.to,
        content: item.text,
        timestamp: new Date(parseInt(item.timestamp)).toISOString(),
        type: 'text',
        metadata: {
          messageId: item.messageId,
          networkCode: item.network_code,
          messagePrice: item.message_price,
          messageType: item.type
        }
      };
      
      messages.push(message);
      
      // Increment metrics counter
      messagesReceived.inc({ platform: 'sms' });
    }
    
    return messages.length === 1 ? messages[0] : messages;
  }
  
  /**
   * Send an SMS message using the default provider
   * @param {string} to - The recipient's phone number
   * @param {string} message - The message to send
   * @param {Object} options - Additional options
   * @returns {Promise<Object>} The API response
   */
  async sendMessage(to, message, options = {}) {
    const provider = options.provider || this.defaultProvider;
    
    if (provider === 'twilio') {
      return this.sendTwilioMessage(to, message, options);
    } else if (provider === 'vonage') {
      return this.sendVonageMessage(to, message, options);
    } else {
      throw new Error(`Unsupported SMS provider: ${provider}`);
    }
  }
  
  /**
   * Send an SMS message using Twilio
   * @param {string} to - The recipient's phone number
   * @param {string} message - The message to send
   * @param {Object} options - Additional options
   * @returns {Promise<Object>} The API response
   */
  async sendTwilioMessage(to, message, options = {}) {
    if (!this.twilioClient) {
      throw new Error('Twilio client not initialized');
    }
    
    try {
      const messageOptions = {
        body: message,
        from: options.from || this.twilioPhoneNumber,
        to
      };
      
      // Add media URLs if provided
      if (options.mediaUrls && Array.isArray(options.mediaUrls) && options.mediaUrls.length > 0) {
        messageOptions.mediaUrl = options.mediaUrls;
      }
      
      const response = await this.twilioClient.messages.create(messageOptions);
      
      // Increment metrics counter
      messagesSent.inc({ platform: 'sms' });
      
      return {
        id: response.sid,
        platform: 'sms',
        provider: 'twilio',
        to,
        content: message,
        status: response.status,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      console.error('Error sending Twilio message:', error.message);
      throw new Error(`Failed to send Twilio message: ${error.message}`);
    }
  }
  
  /**
   * Send an SMS message using Vonage
   * @param {string} to - The recipient's phone number
   * @param {string} message - The message to send
   * @param {Object} options - Additional options
   * @returns {Promise<Object>} The API response
   */
  async sendVonageMessage(to, message, options = {}) {
    if (!this.vonageClient) {
      throw new Error('Vonage client not initialized');
    }
    
    return new Promise((resolve, reject) => {
      this.vonageClient.message.sendSms(
        options.from || this.vonagePhoneNumber,
        to,
        message,
        options,
        (error, response) => {
          if (error) {
            console.error('Error sending Vonage message:', error);
            reject(new Error(`Failed to send Vonage message: ${error.message}`));
            return;
          }
          
          // Check if the message was sent successfully
          if (response.messages && response.messages.length > 0) {
            const messageResponse = response.messages[0];
            
            if (messageResponse.status === '0') {
              // Increment metrics counter
              messagesSent.inc({ platform: 'sms' });
              
              resolve({
                id: messageResponse.message_id,
                platform: 'sms',
                provider: 'vonage',
                to,
                content: message,
                status: 'sent',
                timestamp: new Date().toISOString(),
                metadata: {
                  remainingBalance: messageResponse.remaining_balance,
                  messagePrice: messageResponse.message_price,
                  network: messageResponse.network
                }
              });
            } else {
              reject(new Error(`Failed to send Vonage message: ${messageResponse.error_text}`));
            }
          } else {
            reject(new Error('Failed to send Vonage message: No response'));
          }
        }
      );
    });
  }
  
  /**
   * Get the status of a sent message
   * @param {string} messageId - The message ID
   * @param {string} provider - The provider (twilio or vonage)
   * @returns {Promise<Object>} The message status
   */
  async getMessageStatus(messageId, provider = null) {
    const smsProvider = provider || this.defaultProvider;
    
    if (smsProvider === 'twilio') {
      if (!this.twilioClient) {
        throw new Error('Twilio client not initialized');
      }
      
      try {
        const message = await this.twilioClient.messages(messageId).fetch();
        
        return {
          id: message.sid,
          status: message.status,
          provider: 'twilio',
          timestamp: message.dateUpdated.toISOString()
        };
      } catch (error) {
        console.error('Error getting Twilio message status:', error.message);
        throw new Error(`Failed to get Twilio message status: ${error.message}`);
      }
    } else if (smsProvider === 'vonage') {
      // Vonage doesn't have a direct API for message status
      // Status updates are typically received via webhooks
      throw new Error('Vonage message status can only be retrieved via webhooks');
    } else {
      throw new Error(`Unsupported SMS provider: ${smsProvider}`);
    }
  }
}

module.exports = new SMSClient();
