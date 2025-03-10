/**
 * AI-Powered Audio Compression
 * 
 * This module provides AI-powered audio compression for WebRTC
 * to minimize latency while maintaining audio quality.
 */

const tf = require('@tensorflow/tfjs-node');
const fs = require('fs');
const path = require('path');

class AudioCompression {
  constructor() {
    this.model = null;
    this.initialized = false;
    this.compressionLevel = 'medium'; // 'low', 'medium', 'high'
    this.sampleRate = 48000;
    this.frameSize = 960; // 20ms at 48kHz
    this.modelPath = process.env.AUDIO_COMPRESSION_MODEL_PATH || path.join(__dirname, 'models/audio_compression');
  }
  
  /**
   * Initialize the audio compression model
   * @param {Object} options - Initialization options
   * @returns {Promise<boolean>} Whether initialization was successful
   */
  async initialize(options = {}) {
    try {
      // Set options
      this.compressionLevel = options.compressionLevel || this.compressionLevel;
      this.sampleRate = options.sampleRate || this.sampleRate;
      this.frameSize = options.frameSize || this.frameSize;
      this.modelPath = options.modelPath || this.modelPath;
      
      // Check if model exists
      if (!fs.existsSync(`${this.modelPath}/model.json`)) {
        console.warn('Audio compression model not found. Using fallback compression.');
        this.initialized = false;
        return false;
      }
      
      // Load the model
      this.model = await tf.loadLayersModel(`file://${this.modelPath}/model.json`);
      
      // Warm up the model
      const dummyInput = tf.zeros([1, this.frameSize, 1]);
      const warmupResult = this.model.predict(dummyInput);
      warmupResult.dispose();
      dummyInput.dispose();
      
      this.initialized = true;
      console.log('Audio compression model initialized');
      return true;
    } catch (error) {
      console.error('Error initializing audio compression model:', error);
      this.initialized = false;
      return false;
    }
  }
  
  /**
   * Compress audio data using the AI model
   * @param {Float32Array} audioData - Raw audio data
   * @returns {Uint8Array} Compressed audio data
   */
  compressAudio(audioData) {
    try {
      if (this.initialized && this.model) {
        return this.compressWithAI(audioData);
      } else {
        return this.compressWithFallback(audioData);
      }
    } catch (error) {
      console.error('Error compressing audio:', error);
      return this.compressWithFallback(audioData);
    }
  }
  
  /**
   * Compress audio data using the AI model
   * @param {Float32Array} audioData - Raw audio data
   * @returns {Uint8Array} Compressed audio data
   */
  compressWithAI(audioData) {
    // Ensure the audio data is the right size
    const paddedData = this.padAudioData(audioData);
    
    // Reshape the audio data for the model
    const frames = this.splitIntoFrames(paddedData);
    const compressedFrames = [];
    
    // Process each frame
    for (const frame of frames) {
      // Convert to tensor
      const inputTensor = tf.tensor(frame, [1, frame.length, 1]);
      
      // Run inference
      const outputTensor = this.model.predict(inputTensor);
      
      // Get the compressed data
      const compressedData = outputTensor.dataSync();
      compressedFrames.push(new Uint8Array(compressedData));
      
      // Clean up tensors
      inputTensor.dispose();
      outputTensor.dispose();
    }
    
    // Combine the compressed frames
    return this.combineFrames(compressedFrames);
  }
  
  /**
   * Compress audio data using a fallback algorithm
   * @param {Float32Array} audioData - Raw audio data
   * @returns {Uint8Array} Compressed audio data
   */
  compressWithFallback(audioData) {
    // Simple mu-law compression as fallback
    const compressedData = new Uint8Array(audioData.length);
    
    for (let i = 0; i < audioData.length; i++) {
      // Mu-law compression
      const sign = audioData[i] < 0 ? -1 : 1;
      const abs = Math.abs(audioData[i]);
      const compressed = sign * Math.log(1 + 255 * abs) / Math.log(1 + 255);
      
      // Convert to 8-bit
      compressedData[i] = Math.floor((compressed + 1) * 127.5);
    }
    
    return compressedData;
  }
  
  /**
   * Decompress audio data
   * @param {Uint8Array} compressedData - Compressed audio data
   * @returns {Float32Array} Decompressed audio data
   */
  decompressAudio(compressedData) {
    try {
      if (this.initialized && this.model) {
        return this.decompressWithAI(compressedData);
      } else {
        return this.decompressWithFallback(compressedData);
      }
    } catch (error) {
      console.error('Error decompressing audio:', error);
      return this.decompressWithFallback(compressedData);
    }
  }
  
  /**
   * Decompress audio data using the AI model
   * @param {Uint8Array} compressedData - Compressed audio data
   * @returns {Float32Array} Decompressed audio data
   */
  decompressWithAI(compressedData) {
    // This is a placeholder for the actual AI decompression
    // In a real implementation, you would have a separate decompression model
    return this.decompressWithFallback(compressedData);
  }
  
  /**
   * Decompress audio data using a fallback algorithm
   * @param {Uint8Array} compressedData - Compressed audio data
   * @returns {Float32Array} Decompressed audio data
   */
  decompressWithFallback(compressedData) {
    // Simple mu-law decompression as fallback
    const decompressedData = new Float32Array(compressedData.length);
    
    for (let i = 0; i < compressedData.length; i++) {
      // Convert from 8-bit
      const normalized = compressedData[i] / 127.5 - 1;
      
      // Mu-law decompression
      const sign = normalized < 0 ? -1 : 1;
      const abs = Math.abs(normalized);
      decompressedData[i] = sign * ((Math.exp(abs * Math.log(1 + 255)) - 1) / 255);
    }
    
    return decompressedData;
  }
  
  /**
   * Pad audio data to ensure it's a multiple of the frame size
   * @param {Float32Array} audioData - Raw audio data
   * @returns {Float32Array} Padded audio data
   */
  padAudioData(audioData) {
    const remainder = audioData.length % this.frameSize;
    
    if (remainder === 0) {
      return audioData;
    }
    
    const paddingLength = this.frameSize - remainder;
    const paddedData = new Float32Array(audioData.length + paddingLength);
    paddedData.set(audioData);
    
    return paddedData;
  }
  
  /**
   * Split audio data into frames
   * @param {Float32Array} audioData - Raw audio data
   * @returns {Array<Float32Array>} Array of frames
   */
  splitIntoFrames(audioData) {
    const frameCount = Math.floor(audioData.length / this.frameSize);
    const frames = [];
    
    for (let i = 0; i < frameCount; i++) {
      const start = i * this.frameSize;
      const end = start + this.frameSize;
      frames.push(audioData.slice(start, end));
    }
    
    return frames;
  }
  
  /**
   * Combine compressed frames into a single array
   * @param {Array<Uint8Array>} frames - Array of compressed frames
   * @returns {Uint8Array} Combined compressed data
   */
  combineFrames(frames) {
    // Calculate total length
    let totalLength = 0;
    for (const frame of frames) {
      totalLength += frame.length;
    }
    
    // Create combined array
    const combined = new Uint8Array(totalLength);
    let offset = 0;
    
    // Copy each frame
    for (const frame of frames) {
      combined.set(frame, offset);
      offset += frame.length;
    }
    
    return combined;
  }
  
  /**
   * Set the compression level
   * @param {string} level - Compression level ('low', 'medium', 'high')
   */
  setCompressionLevel(level) {
    if (['low', 'medium', 'high'].includes(level)) {
      this.compressionLevel = level;
    } else {
      console.warn(`Invalid compression level: ${level}. Using 'medium' instead.`);
      this.compressionLevel = 'medium';
    }
  }
  
  /**
   * Get the current compression ratio
   * @returns {number} Compression ratio
   */
  getCompressionRatio() {
    switch (this.compressionLevel) {
      case 'low':
        return 2; // 2:1 compression
      case 'medium':
        return 4; // 4:1 compression
      case 'high':
        return 8; // 8:1 compression
      default:
        return 4;
    }
  }
  
  /**
   * Get the estimated bitrate
   * @returns {number} Estimated bitrate in kbps
   */
  getEstimatedBitrate() {
    const bitsPerSample = 8; // 8 bits per sample after compression
    const samplesPerSecond = this.sampleRate;
    
    return (bitsPerSample * samplesPerSecond) / (this.getCompressionRatio() * 1000);
  }
  
  /**
   * Create a browser-compatible version of the compression model
   * @param {string} outputPath - Path to save the browser model
   * @returns {Promise<boolean>} Whether conversion was successful
   */
  async createBrowserModel(outputPath) {
    try {
      if (!this.initialized || !this.model) {
        throw new Error('Model not initialized');
      }
      
      // Create output directory if it doesn't exist
      if (!fs.existsSync(outputPath)) {
        fs.mkdirSync(outputPath, { recursive: true });
      }
      
      // Save the model in TensorFlow.js format
      await this.model.save(`file://${outputPath}`);
      
      console.log(`Browser model saved to ${outputPath}`);
      return true;
    } catch (error) {
      console.error('Error creating browser model:', error);
      return false;
    }
  }
}

module.exports = new AudioCompression();
