/**
 * Enhanced JWT Service
 * 
 * This service provides enhanced JWT functionality with short-lived access tokens,
 * refresh tokens, and token rotation for improved security.
 */

const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { AuthenticationError } = require('apollo-server-express');

class JWTService {
  constructor() {
    this.accessTokenSecret = process.env.JWT_ACCESS_SECRET || 'access-secret-key';
    this.refreshTokenSecret = process.env.JWT_REFRESH_SECRET || 'refresh-secret-key';
    this.accessTokenExpiry = process.env.JWT_ACCESS_EXPIRY || '15m';
    this.refreshTokenExpiry = process.env.JWT_REFRESH_EXPIRY || '7d';
    this.issuer = process.env.JWT_ISSUER || 'uc-hub';
    this.audience = process.env.JWT_AUDIENCE || 'uc-hub-client';
  }
  
  /**
   * Generate an access token
   * @param {Object} user - The user object
   * @returns {string} The access token
   */
  generateAccessToken(user) {
    return jwt.sign(
      {
        sub: user.id,
        email: user.email,
        roles: user.roles || ['USER'],
        type: 'access'
      },
      this.accessTokenSecret,
      {
        expiresIn: this.accessTokenExpiry,
        issuer: this.issuer,
        audience: this.audience,
        jwtid: crypto.randomBytes(16).toString('hex')
      }
    );
  }
  
  /**
   * Generate a refresh token
   * @param {Object} user - The user object
   * @returns {string} The refresh token
   */
  generateRefreshToken(user) {
    return jwt.sign(
      {
        sub: user.id,
        type: 'refresh',
        tokenVersion: user.tokenVersion || 0
      },
      this.refreshTokenSecret,
      {
        expiresIn: this.refreshTokenExpiry,
        issuer: this.issuer,
        audience: this.audience,
        jwtid: crypto.randomBytes(16).toString('hex')
      }
    );
  }
  
  /**
   * Generate both access and refresh tokens
   * @param {Object} user - The user object
   * @returns {Object} Object containing both tokens
   */
  generateTokens(user) {
    return {
      accessToken: this.generateAccessToken(user),
      refreshToken: this.generateRefreshToken(user),
      expiresIn: this.getExpirySeconds(this.accessTokenExpiry)
    };
  }
  
  /**
   * Verify an access token
   * @param {string} token - The access token
   * @returns {Object} The decoded token payload
   */
  verifyAccessToken(token) {
    try {
      return jwt.verify(token, this.accessTokenSecret, {
        issuer: this.issuer,
        audience: this.audience
      });
    } catch (error) {
      throw new AuthenticationError('Invalid or expired access token');
    }
  }
  
  /**
   * Verify a refresh token
   * @param {string} token - The refresh token
   * @param {number} tokenVersion - The user's current token version
   * @returns {Object} The decoded token payload
   */
  verifyRefreshToken(token, tokenVersion) {
    try {
      const decoded = jwt.verify(token, this.refreshTokenSecret, {
        issuer: this.issuer,
        audience: this.audience
      });
      
      // Check token version to prevent use of revoked tokens
      if (decoded.tokenVersion !== tokenVersion) {
        throw new AuthenticationError('Token has been revoked');
      }
      
      return decoded;
    } catch (error) {
      throw new AuthenticationError('Invalid or expired refresh token');
    }
  }
  
  /**
   * Refresh the access token using a refresh token
   * @param {string} refreshToken - The refresh token
   * @param {Object} user - The user object
   * @returns {Object} Object containing the new access token
   */
  refreshAccessToken(refreshToken, user) {
    const decoded = this.verifyRefreshToken(refreshToken, user.tokenVersion);
    
    if (decoded.sub !== user.id) {
      throw new AuthenticationError('Invalid refresh token');
    }
    
    return {
      accessToken: this.generateAccessToken(user),
      expiresIn: this.getExpirySeconds(this.accessTokenExpiry)
    };
  }
  
  /**
   * Revoke all refresh tokens for a user by incrementing the token version
   * @param {Object} user - The user object
   * @returns {number} The new token version
   */
  revokeRefreshTokens(user) {
    const newVersion = (user.tokenVersion || 0) + 1;
    return newVersion;
  }
  
  /**
   * Extract the token from the authorization header
   * @param {Object} req - Express request object
   * @returns {string|null} The token or null if not found
   */
  extractTokenFromHeader(req) {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return null;
    }
    
    return authHeader.substring(7);
  }
  
  /**
   * Convert a time string to seconds
   * @param {string} timeString - Time string (e.g., '15m', '1h', '7d')
   * @returns {number} Time in seconds
   */
  getExpirySeconds(timeString) {
    const unit = timeString.charAt(timeString.length - 1);
    const value = parseInt(timeString.substring(0, timeString.length - 1), 10);
    
    switch (unit) {
      case 's':
        return value;
      case 'm':
        return value * 60;
      case 'h':
        return value * 60 * 60;
      case 'd':
        return value * 24 * 60 * 60;
      default:
        return 900; // Default to 15 minutes
    }
  }
}

module.exports = new JWTService();
