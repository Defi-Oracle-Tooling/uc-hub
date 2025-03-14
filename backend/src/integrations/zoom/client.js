/**
 * Zoom Integration Client
 * 
 * This module provides integration with the Zoom API for
 * meeting management and user authentication.
 */

const axios = require('axios');
const crypto = require('crypto');
const { messagesSent, messagesReceived } = require('../../middleware/monitoring/metrics');

class ZoomClient {
  constructor() {
    this.clientId = process.env.ZOOM_CLIENT_ID;
    this.clientSecret = process.env.ZOOM_CLIENT_SECRET;
    this.redirectUri = process.env.ZOOM_REDIRECT_URI;
    this.webhookSecret = process.env.ZOOM_WEBHOOK_SECRET;
    this.baseUrl = 'https://api.zoom.us/v2';
    this.authUrl = 'https://zoom.us/oauth/token';
  }
  
  /**
   * Get the OAuth authorization URL
   * @param {string} state - State parameter for CSRF protection
   * @returns {string} The authorization URL
   */
  getAuthorizationUrl(state) {
    return `https://zoom.us/oauth/authorize?response_type=code&client_id=${this.clientId}&redirect_uri=${encodeURIComponent(this.redirectUri)}&state=${state}`;
  }
  
  /**
   * Exchange an authorization code for access and refresh tokens
   * @param {string} code - The authorization code
   * @returns {Promise<Object>} The token response
   */
  async exchangeCodeForTokens(code) {
    try {
      const tokenUrl = 'https://zoom.us/oauth/token';
      const credentials = Buffer.from(`${this.clientId}:${this.clientSecret}`).toString('base64');
      
      const response = await axios.post(
        tokenUrl,
        `grant_type=authorization_code&code=${code}&redirect_uri=${encodeURIComponent(this.redirectUri)}`,
        {
          headers: {
            'Authorization': `Basic ${credentials}`,
            'Content-Type': 'application/x-www-form-urlencoded'
          }
        }
      );
      
      return response.data;
    } catch (error) {
      console.error('Error exchanging code for tokens:', error.response?.data || error.message);
      throw new Error('Failed to exchange authorization code for tokens');
    }
  }
  
  /**
   * Refresh an access token
   * @param {string} refreshToken - The refresh token
   * @returns {Promise<Object>} The new token response
   */
  async refreshAccessToken(refreshToken) {
    try {
      const credentials = Buffer.from(`${this.clientId}:${this.clientSecret}`).toString('base64');
      
      const response = await axios.post(
        this.authUrl,
        `grant_type=refresh_token&refresh_token=${refreshToken}`,
        {
          headers: {
            'Authorization': `Basic ${credentials}`,
            'Content-Type': 'application/x-www-form-urlencoded'
          }
        }
      );
      
      return response.data;
    } catch (error) {
      console.error('Error refreshing token:', error.response?.data || error.message);
      throw new Error('Failed to refresh access token');
    }
  }
  
  /**
   * Verify webhook request from Zoom
   * @param {string} signature - The signature from the request header
   * @param {string} timestamp - The timestamp from the request header
   * @param {string} body - The raw request body
   * @returns {boolean} Whether the signature is valid
   */
  verifyWebhook(signature, timestamp, body) {
    if (!this.webhookSecret || !signature || !timestamp) {
      return false;
    }
    
    const message = `v0:${timestamp}:${body}`;
    const hmac = crypto.createHmac('sha256', this.webhookSecret);
    hmac.update(message);
    const expectedSignature = `v0=${hmac.digest('hex')}`;
    
    return signature === expectedSignature;
  }
  
  /**
   * Process incoming webhook events from Zoom
   * @param {Object} body - The webhook request body
   * @returns {Object} Processed event object
   */
  processWebhook(body) {
    if (!body.event) {
      return null;
    }
    
    const event = {
      type: body.event,
      timestamp: new Date().toISOString(),
      platform: 'zoom',
      payload: body
    };
    
    // Handle different event types
    switch (body.event) {
      case 'meeting.started':
      case 'meeting.ended':
      case 'meeting.updated':
        event.meetingId = body.payload?.object?.id;
        event.hostId = body.payload?.object?.host_id;
        break;
        
      case 'meeting.participant_joined':
      case 'meeting.participant_left':
        event.meetingId = body.payload?.object?.id;
        event.participantId = body.payload?.object?.participant?.id;
        event.participantName = body.payload?.object?.participant?.user_name;
        break;
        
      case 'meeting.chat_message_sent':
        event.meetingId = body.payload?.object?.id;
        event.senderId = body.payload?.object?.message?.sender?.id;
        event.senderName = body.payload?.object?.message?.sender?.user_name;
        event.message = body.payload?.object?.message?.message;
        
        // Increment metrics counter
        messagesReceived.inc({ platform: 'zoom' });
        break;
    }
    
    return event;
  }
  
  /**
   * Make an authenticated request to the Zoom API
   * @param {string} method - The HTTP method
   * @param {string} endpoint - The API endpoint
   * @param {Object} data - The request data
   * @param {string} accessToken - The access token
   * @returns {Promise<Object>} The API response
   */
  async request(method, endpoint, data, accessToken) {
    try {
      const url = `${this.baseUrl}${endpoint}`;
      
      const response = await axios({
        method,
        url,
        data,
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        }
      });
      
      return response.data;
    } catch (error) {
      console.error(`Error making Zoom API request to ${endpoint}:`, error.response?.data || error.message);
      throw new Error(`Failed to make Zoom API request: ${error.message}`);
    }
  }
  
  /**
   * Get user information
   * @param {string} accessToken - The access token
   * @returns {Promise<Object>} The user information
   */
  async getUserInfo(accessToken) {
    return this.request('GET', '/users/me', null, accessToken);
  }
  
  /**
   * Create a meeting
   * @param {Object} meetingDetails - The meeting details
   * @param {string} accessToken - The access token
   * @returns {Promise<Object>} The created meeting
   */
  async createMeeting(meetingDetails, accessToken) {
    return this.request('POST', '/users/me/meetings', meetingDetails, accessToken);
  }
  
  /**
   * Get a meeting
   * @param {string} meetingId - The meeting ID
   * @param {string} accessToken - The access token
   * @returns {Promise<Object>} The meeting information
   */
  async getMeeting(meetingId, accessToken) {
    return this.request('GET', `/meetings/${meetingId}`, null, accessToken);
  }
  
  /**
   * Update a meeting
   * @param {string} meetingId - The meeting ID
   * @param {Object} meetingDetails - The updated meeting details
   * @param {string} accessToken - The access token
   * @returns {Promise<Object>} The updated meeting
   */
  async updateMeeting(meetingId, meetingDetails, accessToken) {
    return this.request('PATCH', `/meetings/${meetingId}`, meetingDetails, accessToken);
  }
  
  /**
   * Delete a meeting
   * @param {string} meetingId - The meeting ID
   * @param {string} accessToken - The access token
   * @returns {Promise<void>}
   */
  async deleteMeeting(meetingId, accessToken) {
    return this.request('DELETE', `/meetings/${meetingId}`, null, accessToken);
  }
  
  /**
   * List meetings
   * @param {string} accessToken - The access token
   * @param {string} type - The meeting type (scheduled, live, upcoming)
   * @returns {Promise<Object>} The list of meetings
   */
  async listMeetings(accessToken, type = 'scheduled') {
    return this.request('GET', `/users/me/meetings?type=${type}`, null, accessToken);
  }
  
  /**
   * Get meeting participants
   * @param {string} meetingId - The meeting ID
   * @param {string} accessToken - The access token
   * @returns {Promise<Object>} The list of participants
   */
  async getMeetingParticipants(meetingId, accessToken) {
    return this.request('GET', `/meetings/${meetingId}/participants`, null, accessToken);
  }
  
  /**
   * Send a chat message to a meeting
   * @param {string} meetingId - The meeting ID
   * @param {string} message - The message to send
   * @param {string} accessToken - The access token
   * @returns {Promise<Object>} The API response
   */
  async sendChatMessage(meetingId, message, accessToken) {
    const data = {
      message,
      to_contact: 'everyone'
    };
    
    const response = await this.request('POST', `/meetings/${meetingId}/chat/messages`, data, accessToken);
    
    // Increment metrics counter
    messagesSent.inc({ platform: 'zoom' });
    
    return response;
  }
  
  /**
   * Create a meeting invitation
   * @param {string} meetingId - The meeting ID
   * @param {Array<string>} emails - The recipient email addresses
   * @param {string} accessToken - The access token
   * @returns {Promise<Object>} The API response
   */
  async createMeetingInvitation(meetingId, emails, accessToken) {
    const data = {
      emails
    };
    
    return this.request('POST', `/meetings/${meetingId}/invitation`, data, accessToken);
  }
  
  /**
   * End a meeting
   * @param {string} meetingId - The meeting ID
   * @param {string} accessToken - The access token
   * @returns {Promise<Object>} The API response
   */
  async endMeeting(meetingId, accessToken) {
    const data = {
      action: 'end'
    };
    
    return this.request('PUT', `/meetings/${meetingId}/status`, data, accessToken);
  }
}

module.exports = new ZoomClient();
