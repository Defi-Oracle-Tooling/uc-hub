/**
 * Two-Factor Authentication Service
 * 
 * This service provides functionality for generating and verifying
 * time-based one-time passwords (TOTP) for two-factor authentication.
 */

const speakeasy = require('speakeasy');
const QRCode = require('qrcode');

class TwoFactorAuthService {
  /**
   * Generate a new secret for a user
   * @param {string} userId - The ID of the user
   * @returns {Object} Object containing the secret and otpauth URL
   */
  generateSecret(userId) {
    const secret = speakeasy.generateSecret({
      name: `UC-Hub:${userId}`
    });
    
    return {
      otpauth_url: secret.otpauth_url,
      base32: secret.base32
    };
  }
  
  /**
   * Generate a QR code for the otpauth URL
   * @param {string} otpauthUrl - The otpauth URL
   * @returns {Promise<string>} The QR code as a data URL
   */
  async generateQRCode(otpauthUrl) {
    return await QRCode.toDataURL(otpauthUrl);
  }
  
  /**
   * Verify a TOTP token
   * @param {string} token - The token to verify
   * @param {string} secret - The secret key in base32 format
   * @param {Object} options - Additional options
   * @returns {boolean} Whether the token is valid
   */
  verifyToken(token, secret, options = {}) {
    return speakeasy.totp.verify({
      secret,
      encoding: 'base32',
      token,
      window: options.window || 1 // Allow 1 period before/after for clock drift
    });
  }
  
  /**
   * Generate a set of recovery codes
   * @param {number} count - Number of recovery codes to generate
   * @returns {Array<string>} Array of recovery codes
   */
  generateRecoveryCodes(count = 10) {
    const codes = [];
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    
    for (let i = 0; i < count; i++) {
      let code = '';
      for (let j = 0; j < 10; j++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
      }
      // Format as XXXX-XXXX-XX
      code = `${code.substr(0, 4)}-${code.substr(4, 4)}-${code.substr(8, 2)}`;
      codes.push(code);
    }
    
    return codes;
  }
}

module.exports = new TwoFactorAuthService();
