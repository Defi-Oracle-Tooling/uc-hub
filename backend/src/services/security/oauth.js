/**
 * OAuth 2.1 Service
 * 
 * This service provides OAuth 2.1 authentication functionality with
 * PKCE (Proof Key for Code Exchange) flow for enhanced security.
 */

const axios = require('axios');
const crypto = require('crypto');
const querystring = require('querystring');

class OAuthService {
  constructor() {
    this.providers = {
      google: {
        authorizationUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
        tokenUrl: 'https://oauth2.googleapis.com/token',
        userInfoUrl: 'https://www.googleapis.com/oauth2/v3/userinfo',
        clientId: process.env.GOOGLE_CLIENT_ID,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET,
        redirectUri: process.env.GOOGLE_REDIRECT_URI,
        scope: 'openid profile email'
      },
      microsoft: {
        authorizationUrl: 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize',
        tokenUrl: 'https://login.microsoftonline.com/common/oauth2/v2.0/token',
        userInfoUrl: 'https://graph.microsoft.com/v1.0/me',
        clientId: process.env.MICROSOFT_CLIENT_ID,
        clientSecret: process.env.MICROSOFT_CLIENT_SECRET,
        redirectUri: process.env.MICROSOFT_REDIRECT_URI,
        scope: 'openid profile email User.Read'
      }
    };
  }
  
  /**
   * Generate a code verifier and challenge for PKCE
   * @returns {Object} Object containing code verifier and challenge
   */
  generatePKCE() {
    // Generate a random code verifier
    const codeVerifier = crypto.randomBytes(32).toString('base64url');
    
    // Generate code challenge using S256 method
    const codeChallenge = crypto
      .createHash('sha256')
      .update(codeVerifier)
      .digest('base64url');
    
    return {
      codeVerifier,
      codeChallenge,
      method: 'S256'
    };
  }
  
  /**
   * Generate an authorization URL for a provider
   * @param {string} provider - The OAuth provider (e.g., 'google', 'microsoft')
   * @param {string} codeChallenge - The PKCE code challenge
   * @param {string} state - A random state value for CSRF protection
   * @returns {string} The authorization URL
   */
  getAuthorizationUrl(provider, codeChallenge, state) {
    const config = this.providers[provider];
    
    if (!config) {
      throw new Error(`Unsupported OAuth provider: ${provider}`);
    }
    
    const params = {
      client_id: config.clientId,
      redirect_uri: config.redirectUri,
      response_type: 'code',
      scope: config.scope,
      state,
      code_challenge: codeChallenge,
      code_challenge_method: 'S256'
    };
    
    return `${config.authorizationUrl}?${querystring.stringify(params)}`;
  }
  
  /**
   * Exchange an authorization code for tokens
   * @param {string} provider - The OAuth provider
   * @param {string} code - The authorization code
   * @param {string} codeVerifier - The PKCE code verifier
   * @returns {Promise<Object>} The token response
   */
  async exchangeCodeForTokens(provider, code, codeVerifier) {
    const config = this.providers[provider];
    
    if (!config) {
      throw new Error(`Unsupported OAuth provider: ${provider}`);
    }
    
    const params = {
      client_id: config.clientId,
      client_secret: config.clientSecret,
      code,
      code_verifier: codeVerifier,
      grant_type: 'authorization_code',
      redirect_uri: config.redirectUri
    };
    
    try {
      const response = await axios.post(
        config.tokenUrl,
        querystring.stringify(params),
        {
          headers: {
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
   * Get user information using an access token
   * @param {string} provider - The OAuth provider
   * @param {string} accessToken - The access token
   * @returns {Promise<Object>} The user information
   */
  async getUserInfo(provider, accessToken) {
    const config = this.providers[provider];
    
    if (!config) {
      throw new Error(`Unsupported OAuth provider: ${provider}`);
    }
    
    try {
      const response = await axios.get(config.userInfoUrl, {
        headers: {
          Authorization: `Bearer ${accessToken}`
        }
      });
      
      return response.data;
    } catch (error) {
      console.error('Error getting user info:', error.response?.data || error.message);
      throw new Error('Failed to get user information');
    }
  }
  
  /**
   * Refresh an access token
   * @param {string} provider - The OAuth provider
   * @param {string} refreshToken - The refresh token
   * @returns {Promise<Object>} The new token response
   */
  async refreshAccessToken(provider, refreshToken) {
    const config = this.providers[provider];
    
    if (!config) {
      throw new Error(`Unsupported OAuth provider: ${provider}`);
    }
    
    const params = {
      client_id: config.clientId,
      client_secret: config.clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token'
    };
    
    try {
      const response = await axios.post(
        config.tokenUrl,
        querystring.stringify(params),
        {
          headers: {
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
}

module.exports = new OAuthService();
