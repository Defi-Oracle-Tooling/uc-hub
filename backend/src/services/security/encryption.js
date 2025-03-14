/**
 * Encryption Service
 * 
 * This service provides end-to-end encryption functionality for secure
 * message transmission between users.
 */

const crypto = require('crypto');

class EncryptionService {
  /**
   * Generate a new RSA key pair
   * @returns {Object} Object containing public and private keys
   */
  generateKeyPair() {
    return crypto.generateKeyPairSync('rsa', {
      modulusLength: 4096,
      publicKeyEncoding: {
        type: 'spki',
        format: 'pem'
      },
      privateKeyEncoding: {
        type: 'pkcs8',
        format: 'pem'
      }
    });
  }
  
  /**
   * Encrypt a message using a public key
   * @param {string} message - The message to encrypt
   * @param {string} publicKey - The public key in PEM format
   * @returns {string} The encrypted message as a base64 string
   */
  encryptMessage(message, publicKey) {
    const buffer = Buffer.from(message, 'utf8');
    return crypto.publicEncrypt(
      {
        key: publicKey,
        padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
        oaepHash: 'sha256'
      },
      buffer
    ).toString('base64');
  }
  
  /**
   * Decrypt a message using a private key
   * @param {string} encryptedMessage - The encrypted message as a base64 string
   * @param {string} privateKey - The private key in PEM format
   * @returns {string} The decrypted message
   */
  decryptMessage(encryptedMessage, privateKey) {
    const buffer = Buffer.from(encryptedMessage, 'base64');
    return crypto.privateDecrypt(
      {
        key: privateKey,
        padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
        oaepHash: 'sha256'
      },
      buffer
    ).toString('utf8');
  }
  
  /**
   * Generate a symmetric encryption key
   * @returns {string} The encryption key as a hex string
   */
  generateSymmetricKey() {
    return crypto.randomBytes(32).toString('hex');
  }
  
  /**
   * Encrypt a message using a symmetric key
   * @param {string} message - The message to encrypt
   * @param {string} key - The encryption key as a hex string
   * @returns {Object} Object containing the encrypted message and IV
   */
  encryptSymmetric(message, key) {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv(
      'aes-256-gcm',
      Buffer.from(key, 'hex'),
      iv
    );
    
    let encrypted = cipher.update(message, 'utf8', 'base64');
    encrypted += cipher.final('base64');
    
    return {
      encrypted,
      iv: iv.toString('hex'),
      authTag: cipher.getAuthTag().toString('hex')
    };
  }
  
  /**
   * Decrypt a message using a symmetric key
   * @param {string} encrypted - The encrypted message
   * @param {string} key - The encryption key as a hex string
   * @param {string} iv - The initialization vector as a hex string
   * @param {string} authTag - The authentication tag as a hex string
   * @returns {string} The decrypted message
   */
  decryptSymmetric(encrypted, key, iv, authTag) {
    const decipher = crypto.createDecipheriv(
      'aes-256-gcm',
      Buffer.from(key, 'hex'),
      Buffer.from(iv, 'hex')
    );
    
    decipher.setAuthTag(Buffer.from(authTag, 'hex'));
    
    let decrypted = decipher.update(encrypted, 'base64', 'utf8');
    decrypted += decipher.final('utf8');
    
    return decrypted;
  }
  
  /**
   * Generate a digital signature for a message
   * @param {string} message - The message to sign
   * @param {string} privateKey - The private key in PEM format
   * @returns {string} The signature as a base64 string
   */
  sign(message, privateKey) {
    const signer = crypto.createSign('SHA256');
    signer.update(message);
    return signer.sign(privateKey, 'base64');
  }
  
  /**
   * Verify a digital signature
   * @param {string} message - The original message
   * @param {string} signature - The signature as a base64 string
   * @param {string} publicKey - The public key in PEM format
   * @returns {boolean} Whether the signature is valid
   */
  verify(message, signature, publicKey) {
    const verifier = crypto.createVerify('SHA256');
    verifier.update(message);
    return verifier.verify(publicKey, signature, 'base64');
  }
}

module.exports = new EncryptionService();
