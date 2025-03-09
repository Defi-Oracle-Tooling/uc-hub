const axios = require('axios');
const { ClientSecretCredential } = require('@azure/identity');
const { Client } = require('@microsoft/microsoft-graph-client');
const { TokenCredentialAuthenticationProvider } = require('@microsoft/microsoft-graph-client/authProviders/azureTokenCredentials');
const config = require('config');

class TeamsService {
  constructor() {
    this.client = null;
    this.initializeClient();
  }

  async initializeClient() {
    try {
      const credential = new ClientSecretCredential(
        config.get('teams.tenantId'),
        config.get('teams.clientId'),
        config.get('teams.clientSecret')
      );

      const authProvider = new TokenCredentialAuthenticationProvider(credential, {
        scopes: ['https://graph.microsoft.com/.default']
      });

      this.client = Client.initWithMiddleware({
        authProvider
      });
    } catch (error) {
      console.error('Failed to initialize Teams client:', error);
      throw error;
    }
  }

  async createChat(participants, title) {
    try {
      const chat = await this.client.api('/chats').post({
        chatType: 'group',
        topic: title,
        members: participants.map(userId => ({
          '@odata.type': '#microsoft.graph.aadUserConversationMember',
          roles: ['owner'],
          'user@odata.bind': `https://graph.microsoft.com/v1.0/users/${userId}`
        }))
      });

      return {
        externalId: chat.id,
        webUrl: chat.webUrl
      };
    } catch (error) {
      console.error('Failed to create Teams chat:', error);
      throw error;
    }
  }

  async sendMessage(chatId, content, mentions = []) {
    try {
      const message = await this.client.api(`/chats/${chatId}/messages`).post({
        body: {
          content,
          contentType: 'html'
        },
        mentions
      });

      return {
        externalId: message.id,
        timestamp: message.createdDateTime
      };
    } catch (error) {
      console.error('Failed to send Teams message:', error);
      throw error;
    }
  }

  async scheduleMeeting(organizer, attendees, details) {
    try {
      const meeting = await this.client.api('/users/${organizer}/onlineMeetings').post({
        startDateTime: details.startTime,
        endDateTime: details.endTime,
        subject: details.title,
        participants: {
          organizer: {
            identity: {
              user: {
                id: organizer
              }
            }
          },
          attendees: attendees.map(userId => ({
            identity: {
              user: {
                id: userId
              }
            }
          }))
        }
      });

      return {
        externalId: meeting.id,
        joinUrl: meeting.joinUrl,
        audioConferencing: meeting.audioConferencing
      };
    } catch (error) {
      console.error('Failed to schedule Teams meeting:', error);
      throw error;
    }
  }

  async getPresenceInfo(userIds) {
    try {
      const presenceInfo = await Promise.all(
        userIds.map(userId =>
          this.client.api(`/users/${userId}/presence`).get()
        )
      );

      return presenceInfo.map(info => ({
        userId: info.id,
        status: this.mapTeamsStatus(info.availability),
        activity: info.activity
      }));
    } catch (error) {
      console.error('Failed to get Teams presence info:', error);
      throw error;
    }
  }

  mapTeamsStatus(teamsStatus) {
    const statusMap = {
      'Available': 'online',
      'AvailableIdle': 'idle',
      'Away': 'away',
      'BeRightBack': 'away',
      'Busy': 'dnd',
      'BusyIdle': 'dnd',
      'DoNotDisturb': 'dnd',
      'Offline': 'offline',
      'PresenceUnknown': 'unknown'
    };

    return statusMap[teamsStatus] || 'unknown';
  }

  // Webhook handling
  async registerWebhook(resource, notificationUrl) {
    try {
      const subscription = await this.client.api('/subscriptions').post({
        changeType: 'created,updated',
        notificationUrl,
        resource,
        expirationDateTime: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000), // 3 days
        clientState: config.get('teams.webhookSecret')
      });

      return subscription.id;
    } catch (error) {
      console.error('Failed to register Teams webhook:', error);
      throw error;
    }
  }

  async renewWebhook(subscriptionId) {
    try {
      await this.client.api(`/subscriptions/${subscriptionId}`).patch({
        expirationDateTime: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000)
      });
    } catch (error) {
      console.error('Failed to renew Teams webhook:', error);
      throw error;
    }
  }

  verifyWebhookSignature(signature, body) {
    // Implement signature verification logic for Teams webhooks
    // This will depend on the specific security requirements
    return true;
  }
}

module.exports = new TeamsService();