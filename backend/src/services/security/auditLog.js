/**
 * Audit Logging Service
 * 
 * This service provides secure, immutable audit logging for security-sensitive
 * operations within the application.
 */

const crypto = require('crypto');
const fs = require('fs').promises;
const path = require('path');

class AuditLogService {
  constructor() {
    this.logDirectory = process.env.AUDIT_LOG_DIR || path.join(process.cwd(), 'logs', 'audit');
    this.currentLogFile = null;
    this.currentLogChain = [];
    this.initialized = false;
  }
  
  /**
   * Initialize the audit log service
   */
  async initialize() {
    try {
      await fs.mkdir(this.logDirectory, { recursive: true });
      
      // Create a new log file for this session
      const timestamp = new Date().toISOString().replace(/:/g, '-');
      this.currentLogFile = path.join(this.logDirectory, `audit-${timestamp}.log`);
      
      // Create the genesis block
      const genesisBlock = {
        index: 0,
        timestamp: new Date().toISOString(),
        data: {
          event: 'AUDIT_LOG_INITIALIZED',
          details: {
            service: 'UC-Hub',
            version: process.env.APP_VERSION || '1.0.0'
          }
        },
        previousHash: '0'.repeat(64)
      };
      
      genesisBlock.hash = this.calculateHash(genesisBlock);
      this.currentLogChain.push(genesisBlock);
      
      await this.persistLogChain();
      this.initialized = true;
      
      console.log(`Audit log initialized at ${this.currentLogFile}`);
    } catch (error) {
      console.error('Failed to initialize audit log:', error);
      throw error;
    }
  }
  
  /**
   * Calculate the hash of a log block
   * @param {Object} block - The log block
   * @returns {string} The hash of the block
   */
  calculateHash(block) {
    const blockString = JSON.stringify({
      index: block.index,
      timestamp: block.timestamp,
      data: block.data,
      previousHash: block.previousHash
    });
    
    return crypto.createHash('sha256').update(blockString).digest('hex');
  }
  
  /**
   * Add a new entry to the audit log
   * @param {string} event - The event type
   * @param {Object} details - The event details
   * @param {string} userId - The ID of the user who performed the action
   * @returns {Promise<Object>} The created log entry
   */
  async log(event, details, userId) {
    if (!this.initialized) {
      await this.initialize();
    }
    
    const previousBlock = this.currentLogChain[this.currentLogChain.length - 1];
    
    const newBlock = {
      index: previousBlock.index + 1,
      timestamp: new Date().toISOString(),
      data: {
        event,
        details,
        userId,
        ipAddress: details.ipAddress || 'unknown',
        userAgent: details.userAgent || 'unknown'
      },
      previousHash: previousBlock.hash
    };
    
    newBlock.hash = this.calculateHash(newBlock);
    this.currentLogChain.push(newBlock);
    
    await this.persistLogChain();
    
    return newBlock;
  }
  
  /**
   * Persist the log chain to disk
   * @returns {Promise<void>}
   */
  async persistLogChain() {
    try {
      await fs.writeFile(
        this.currentLogFile,
        JSON.stringify(this.currentLogChain, null, 2)
      );
    } catch (error) {
      console.error('Failed to persist audit log:', error);
      throw error;
    }
  }
  
  /**
   * Verify the integrity of the log chain
   * @returns {Promise<boolean>} Whether the log chain is valid
   */
  async verifyLogChain() {
    for (let i = 1; i < this.currentLogChain.length; i++) {
      const currentBlock = this.currentLogChain[i];
      const previousBlock = this.currentLogChain[i - 1];
      
      // Verify the hash of the current block
      if (currentBlock.hash !== this.calculateHash(currentBlock)) {
        console.error(`Invalid hash for block ${currentBlock.index}`);
        return false;
      }
      
      // Verify the link to the previous block
      if (currentBlock.previousHash !== previousBlock.hash) {
        console.error(`Invalid previous hash for block ${currentBlock.index}`);
        return false;
      }
    }
    
    return true;
  }
  
  /**
   * Export the log chain to a file
   * @param {string} filePath - The path to export to
   * @returns {Promise<void>}
   */
  async exportLogChain(filePath) {
    try {
      await fs.writeFile(
        filePath,
        JSON.stringify(this.currentLogChain, null, 2)
      );
    } catch (error) {
      console.error('Failed to export audit log:', error);
      throw error;
    }
  }
}

module.exports = new AuditLogService();
