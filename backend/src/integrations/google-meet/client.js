/**
 * Google Meet Integration Client
 * 
 * This module provides integration with Google Meet via the Google Calendar API
 * for creating and managing video conferences.
 */

const { google } = require('googleapis');
const { messagesSent, messagesReceived } = require('../../middleware/monitoring/metrics');

class GoogleMeetClient {
  constructor() {
    this.clientId = process.env.GOOGLE_CLIENT_ID;
    this.clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    this.redirectUri = process.env.GOOGLE_REDIRECT_URI;
    this.scopes = [
      'https://www.googleapis.com/auth/calendar',
      'https://www.googleapis.com/auth/calendar.events',
      'https://www.googleapis.com/auth/userinfo.email',
      'https://www.googleapis.com/auth/userinfo.profile'
    ];
  }
  
  /**
   * Create an OAuth2 client
   * @returns {OAuth2Client} The OAuth2 client
   */
  createOAuth2Client() {
    return new google.auth.OAuth2(
      this.clientId,
      this.clientSecret,
      this.redirectUri
    );
  }
  
  /**
   * Get the OAuth authorization URL
   * @param {string} state - State parameter for CSRF protection
   * @returns {string} The authorization URL
   */
  getAuthorizationUrl(state) {
    const oauth2Client = this.createOAuth2Client();
    
    return oauth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: this.scopes,
      state,
      prompt: 'consent'
    });
  }
  
  /**
   * Exchange an authorization code for tokens
   * @param {string} code - The authorization code
   * @returns {Promise<Object>} The token response
   */
  async exchangeCodeForTokens(code) {
    try {
      const oauth2Client = this.createOAuth2Client();
      const { tokens } = await oauth2Client.getToken(code);
      return tokens;
    } catch (error) {
      console.error('Error exchanging code for tokens:', error.message);
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
      const oauth2Client = this.createOAuth2Client();
      oauth2Client.setCredentials({ refresh_token: refreshToken });
      const { credentials } = await oauth2Client.refreshAccessToken();
      return credentials;
    } catch (error) {
      console.error('Error refreshing token:', error.message);
      throw new Error('Failed to refresh access token');
    }
  }
  
  /**
   * Get user information
   * @param {string} accessToken - The access token
   * @returns {Promise<Object>} The user information
   */
  async getUserInfo(accessToken) {
    try {
      const oauth2Client = this.createOAuth2Client();
      oauth2Client.setCredentials({ access_token: accessToken });
      
      const people = google.people({ version: 'v1', auth: oauth2Client });
      const response = await people.people.get({
        resourceName: 'people/me',
        personFields: 'names,emailAddresses,photos'
      });
      
      return response.data;
    } catch (error) {
      console.error('Error getting user info:', error.message);
      throw new Error('Failed to get user information');
    }
  }
  
  /**
   * Create a Google Calendar event with Google Meet conference
   * @param {Object} eventDetails - The event details
   * @param {string} accessToken - The access token
   * @returns {Promise<Object>} The created event
   */
  async createMeeting(eventDetails, accessToken) {
    try {
      const oauth2Client = this.createOAuth2Client();
      oauth2Client.setCredentials({ access_token: accessToken });
      
      const calendar = google.calendar({ version: 'v3', auth: oauth2Client });
      
      // Add conferencing data request
      const event = {
        ...eventDetails,
        conferenceData: {
          createRequest: {
            requestId: `uc-hub-${Date.now()}`,
            conferenceSolutionKey: {
              type: 'hangoutsMeet'
            }
          }
        }
      };
      
      const response = await calendar.events.insert({
        calendarId: 'primary',
        resource: event,
        conferenceDataVersion: 1
      });
      
      return response.data;
    } catch (error) {
      console.error('Error creating Google Meet meeting:', error.message);
      throw new Error('Failed to create Google Meet meeting');
    }
  }
  
  /**
   * Get a Google Calendar event
   * @param {string} eventId - The event ID
   * @param {string} accessToken - The access token
   * @returns {Promise<Object>} The event information
   */
  async getMeeting(eventId, accessToken) {
    try {
      const oauth2Client = this.createOAuth2Client();
      oauth2Client.setCredentials({ access_token: accessToken });
      
      const calendar = google.calendar({ version: 'v3', auth: oauth2Client });
      
      const response = await calendar.events.get({
        calendarId: 'primary',
        eventId
      });
      
      return response.data;
    } catch (error) {
      console.error('Error getting Google Meet meeting:', error.message);
      throw new Error('Failed to get Google Meet meeting');
    }
  }
  
  /**
   * Update a Google Calendar event
   * @param {string} eventId - The event ID
   * @param {Object} eventDetails - The updated event details
   * @param {string} accessToken - The access token
   * @returns {Promise<Object>} The updated event
   */
  async updateMeeting(eventId, eventDetails, accessToken) {
    try {
      const oauth2Client = this.createOAuth2Client();
      oauth2Client.setCredentials({ access_token: accessToken });
      
      const calendar = google.calendar({ version: 'v3', auth: oauth2Client });
      
      const response = await calendar.events.update({
        calendarId: 'primary',
        eventId,
        resource: eventDetails
      });
      
      return response.data;
    } catch (error) {
      console.error('Error updating Google Meet meeting:', error.message);
      throw new Error('Failed to update Google Meet meeting');
    }
  }
  
  /**
   * Delete a Google Calendar event
   * @param {string} eventId - The event ID
   * @param {string} accessToken - The access token
   * @returns {Promise<void>}
   */
  async deleteMeeting(eventId, accessToken) {
    try {
      const oauth2Client = this.createOAuth2Client();
      oauth2Client.setCredentials({ access_token: accessToken });
      
      const calendar = google.calendar({ version: 'v3', auth: oauth2Client });
      
      await calendar.events.delete({
        calendarId: 'primary',
        eventId
      });
    } catch (error) {
      console.error('Error deleting Google Meet meeting:', error.message);
      throw new Error('Failed to delete Google Meet meeting');
    }
  }
  
  /**
   * List Google Calendar events with Google Meet conferences
   * @param {string} accessToken - The access token
   * @param {Object} options - Query options
   * @returns {Promise<Array>} The list of events
   */
  async listMeetings(accessToken, options = {}) {
    try {
      const oauth2Client = this.createOAuth2Client();
      oauth2Client.setCredentials({ access_token: accessToken });
      
      const calendar = google.calendar({ version: 'v3', auth: oauth2Client });
      
      const response = await calendar.events.list({
        calendarId: 'primary',
        timeMin: options.timeMin || new Date().toISOString(),
        maxResults: options.maxResults || 10,
        singleEvents: true,
        orderBy: 'startTime'
      });
      
      // Filter events to only include those with Google Meet conferences
      const events = response.data.items.filter(event => 
        event.conferenceData && 
        event.conferenceData.conferenceSolution && 
        event.conferenceData.conferenceSolution.key.type === 'hangoutsMeet'
      );
      
      return events;
    } catch (error) {
      console.error('Error listing Google Meet meetings:', error.message);
      throw new Error('Failed to list Google Meet meetings');
    }
  }
  
  /**
   * Add an attendee to a Google Calendar event
   * @param {string} eventId - The event ID
   * @param {string} email - The attendee's email
   * @param {string} accessToken - The access token
   * @returns {Promise<Object>} The updated event
   */
  async addAttendee(eventId, email, accessToken) {
    try {
      // First get the current event
      const event = await this.getMeeting(eventId, accessToken);
      
      // Add the new attendee
      const attendees = event.attendees || [];
      
      // Check if the attendee is already in the list
      const existingAttendee = attendees.find(a => a.email === email);
      if (!existingAttendee) {
        attendees.push({ email });
      }
      
      // Update the event
      const updatedEvent = {
        ...event,
        attendees
      };
      
      return this.updateMeeting(eventId, updatedEvent, accessToken);
    } catch (error) {
      console.error('Error adding attendee to Google Meet meeting:', error.message);
      throw new Error('Failed to add attendee to Google Meet meeting');
    }
  }
  
  /**
   * Remove an attendee from a Google Calendar event
   * @param {string} eventId - The event ID
   * @param {string} email - The attendee's email
   * @param {string} accessToken - The access token
   * @returns {Promise<Object>} The updated event
   */
  async removeAttendee(eventId, email, accessToken) {
    try {
      // First get the current event
      const event = await this.getMeeting(eventId, accessToken);
      
      // Remove the attendee
      const attendees = event.attendees || [];
      const updatedAttendees = attendees.filter(a => a.email !== email);
      
      // Update the event
      const updatedEvent = {
        ...event,
        attendees: updatedAttendees
      };
      
      return this.updateMeeting(eventId, updatedEvent, accessToken);
    } catch (error) {
      console.error('Error removing attendee from Google Meet meeting:', error.message);
      throw new Error('Failed to remove attendee from Google Meet meeting');
    }
  }
  
  /**
   * Format a Google Meet event into a standardized meeting object
   * @param {Object} event - The Google Calendar event
   * @returns {Object} Standardized meeting object
   */
  formatMeeting(event) {
    if (!event || !event.conferenceData || !event.conferenceData.entryPoints) {
      return null;
    }
    
    // Find the video conference entry point
    const videoEntryPoint = event.conferenceData.entryPoints.find(
      ep => ep.entryPointType === 'video'
    );
    
    if (!videoEntryPoint) {
      return null;
    }
    
    return {
      id: event.id,
      platform: 'google-meet',
      title: event.summary || 'Google Meet Meeting',
      description: event.description || '',
      startTime: event.start.dateTime || event.start.date,
      endTime: event.end.dateTime || event.end.date,
      joinUrl: videoEntryPoint.uri,
      meetingCode: videoEntryPoint.meetingCode || '',
      creator: {
        email: event.creator.email,
        name: event.creator.displayName || event.creator.email
      },
      attendees: (event.attendees || []).map(attendee => ({
        email: attendee.email,
        name: attendee.displayName || attendee.email,
        status: attendee.responseStatus || 'needsAction'
      })),
      metadata: {
        calendarEventId: event.id,
        conferenceId: event.conferenceData.conferenceId,
        hangoutLink: event.hangoutLink
      }
    };
  }
  
  /**
   * Process a Google Meet chat message (placeholder for future API support)
   * @param {Object} message - The message object
   * @returns {Object} Formatted message object
   */
  formatChatMessage(message) {
    // Note: Google Meet doesn't currently provide a public API for chat messages
    // This is a placeholder for future API support
    
    const formattedMessage = {
      id: message.id || `google-meet-${Date.now()}`,
      platform: 'google-meet',
      meetingId: message.meetingId,
      sender: {
        id: message.sender.id,
        name: message.sender.name,
        email: message.sender.email
      },
      content: message.content,
      timestamp: message.timestamp || new Date().toISOString(),
      type: 'text'
    };
    
    // Increment metrics counter
    messagesReceived.inc({ platform: 'google-meet' });
    
    return formattedMessage;
  }
  
  /**
   * Send a chat message (placeholder for future API support)
   * @param {string} meetingId - The meeting ID
   * @param {string} message - The message to send
   * @param {string} accessToken - The access token
   * @returns {Promise<Object>} The sent message
   */
  async sendChatMessage(meetingId, message, accessToken) {
    // Note: Google Meet doesn't currently provide a public API for chat messages
    // This is a placeholder for future API support
    
    console.warn('Google Meet chat API is not currently available');
    
    // Increment metrics counter anyway for consistency
    messagesSent.inc({ platform: 'google-meet' });
    
    return {
      id: `google-meet-${Date.now()}`,
      platform: 'google-meet',
      meetingId,
      content: message,
      timestamp: new Date().toISOString(),
      status: 'unsupported'
    };
  }
}

module.exports = new GoogleMeetClient();
