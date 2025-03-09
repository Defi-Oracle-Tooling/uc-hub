const axios = require('axios');
const config = require('config');
const crypto = require('crypto');
const redis = require('../utils/redis');
const { CACHE_KEYS } = require('../constants');

class TeamsAuthService {
  constructor() {
    this.tenantId = config.get('teams.tenantId');
    this.clientId = config.get('teams.clientId');
    this.clientSecret = config.get('teams.clientSecret');
    this.redirectUri = config.get('teams.redirectUri');
    this.scopes = [
      'User.Read',
      'Chat.ReadWrite',
      'ChatMessage.Send',
      'Presence.Read.All',
      'OnlineMeetings.ReadWrite'
    ];
  }

  generateAuthUrl(state) {
    const authEndpoint = `https://login.microsoftonline.com/${this.tenantId}/oauth2/v2.0/authorize`;
    const params = new URLSearchParams({
      client_id: this.clientId,
      response_type: 'code',
      redirect_uri: this.redirectUri,
      scope: this.scopes.join(' '),
      state,
      response_mode: 'query'
    });

    return `${authEndpoint}?${params.toString()}`;
  }

  async getTokens(code) {
    const tokenEndpoint = `https://login.microsoftonline.com/${this.tenantId}/oauth2/v2.0/token`;
    const params = new URLSearchParams({
      client_id: this.clientId,
      client_secret: this.clientSecret,
      code,
      redirect_uri: this.redirectUri,
      grant_type: 'authorization_code'
    });

    try {
      const response = await axios.post(tokenEndpoint, params);
      return {
        accessToken: response.data.access_token,
        refreshToken: response.data.refresh_token,
        expiresIn: response.data.expires_in
      };
    } catch (error) {
      console.error('Error getting Teams tokens:', error);
      throw new Error('Failed to get Teams tokens');
    }
  }

  async refreshTokens(refreshToken) {
    const tokenEndpoint = `https://login.microsoftonline.com/${this.tenantId}/oauth2/v2.0/token`;
    const params = new URLSearchParams({
      client_id: this.clientId,
      client_secret: this.clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token'
    });

    try {
      const response = await axios.post(tokenEndpoint, params);
      return {
        accessToken: response.data.access_token,
        refreshToken: response.data.refresh_token,
        expiresIn: response.data.expires_in
      };
    } catch (error) {
      console.error('Error refreshing Teams tokens:', error);
      throw new Error('Failed to refresh Teams tokens');
    }
  }

  async getUserInfo(accessToken) {
    try {
      const response = await axios.get('https://graph.microsoft.com/v1.0/me', {
        headers: {
          Authorization: `Bearer ${accessToken}`
        }
      });

      return {
        teamsId: response.data.id,
        email: response.data.mail || response.data.userPrincipalName,
        name: response.data.displayName,
        givenName: response.data.givenName,
        surname: response.data.surname,
        jobTitle: response.data.jobTitle,
        department: response.data.department
      };
    } catch (error) {
      console.error('Error getting Teams user info:', error);
      throw new Error('Failed to get Teams user info');
    }
  }

  generateState() {
    return crypto.randomBytes(32).toString('hex');
  }

  async storeState(state, userId) {
    const key = `${CACHE_KEYS.TEAMS_AUTH_STATE}${state}`;
    await redis.setex(key, 600, userId); // Expire in 10 minutes
  }

  async verifyState(state) {
    const key = `${CACHE_KEYS.TEAMS_AUTH_STATE}${state}`;
    const userId = await redis.get(key);
    await redis.del(key);
    return userId;
  }

  async storeTokens(userId, tokens) {
    const key = `${CACHE_KEYS.TEAMS_TOKENS}${userId}`;
    await redis.setex(key, tokens.expiresIn, JSON.stringify({
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      expiresAt: Date.now() + (tokens.expiresIn * 1000)
    }));
  }

  async getStoredTokens(userId) {
    const key = `${CACHE_KEYS.TEAMS_TOKENS}${userId}`;
    const tokensStr = await redis.get(key);
    if (!tokensStr) return null;

    const tokens = JSON.parse(tokensStr);
    const now = Date.now();

    // If tokens are expired or about to expire (within 5 minutes), refresh them
    if (tokens.expiresAt - now < 300000) {
      try {
        const newTokens = await this.refreshTokens(tokens.refreshToken);
        await this.storeTokens(userId, newTokens);
        return newTokens;
      } catch (error) {
        console.error('Error refreshing expired tokens:', error);
        await redis.del(key);
        return null;
      }
    }

    return tokens;
  }

  async revokeTokens(userId) {
    const key = `${CACHE_KEYS.TEAMS_TOKENS}${userId}`;
    await redis.del(key);
  }
}

module.exports = new TeamsAuthService();