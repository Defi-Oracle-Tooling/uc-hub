/**
 * Speech-to-Text Implementation
 * 
 * This module provides speech-to-text capabilities using Whisper AI models
 * for real-time transcription with multi-language support.
 */

const fs = require('fs');
const path = require('path');
const axios = require('axios');
const { v4: uuidv4 } = require('uuid');
const { createSpan } = require('../../backend/src/middleware/monitoring/tracing');

// Speech-to-text configuration
const SPEECH_TO_TEXT_CONFIG = {
  modelPath: path.join(__dirname, 'models/whisper'),
  tempAudioPath: path.join(__dirname, 'temp'),
  defaultLanguage: 'en',
  supportedLanguages: ['en', 'es', 'fr', 'de', 'zh', 'ja', 'ko', 'ru', 'ar', 'hi'],
  modelSize: process.env.WHISPER_MODEL_SIZE || 'base',
  useLocalModel: process.env.USE_LOCAL_MODEL === 'true' || false,
  apiEndpoint: process.env.WHISPER_API_ENDPOINT || 'https://api.example.com/speech-to-text',
  apiKey: process.env.WHISPER_API_KEY,
  maxAudioLength: 600, // 10 minutes in seconds
  maxRetries: 3,
  retryDelay: 1000,
  chunkSize: 30, // 30 seconds per chunk
  sampleRate: 16000,
  audioFormat: 'wav'
};

// Ensure directories exist
if (!fs.existsSync(SPEECH_TO_TEXT_CONFIG.tempAudioPath)) {
  fs.mkdirSync(SPEECH_TO_TEXT_CONFIG.tempAudioPath, { recursive: true });
}

/**
 * Speech-to-Text class for transcribing audio to text
 */
class SpeechToText {
  constructor() {
    this.model = null;
    this.isModelLoaded = false;
    this.isModelLoading = false;
    this.modelLoadPromise = null;
  }

  /**
   * Load the speech-to-text model
   * @returns {Promise<boolean>} Whether model loaded successfully
   */
  async loadModel() {
    if (this.isModelLoaded) {
      return true;
    }

    if (this.isModelLoading) {
      return this.modelLoadPromise;
    }

    this.isModelLoading = true;
    this.modelLoadPromise = new Promise(async (resolve) => {
      try {
        await createSpan('ai.speechToText.loadModel', {}, async () => {
          console.log('Loading speech-to-text model...');
          
          if (SPEECH_TO_TEXT_CONFIG.useLocalModel) {
            // In a real implementation, this would load a local Whisper model
            // For demonstration, we'll simulate a successful load
            this.model = {
              transcribe: async (audioBuffer, options) => {
                // Simulate model transcription
                return this._simulateTranscription(audioBuffer, options);
              }
            };
          } else {
            // For API-based model, we don't need to load anything
            this.model = {
              transcribe: async (audioBuffer, options) => {
                return this._callWhisperAPI(audioBuffer, options);
              }
            };
          }
          
          this.isModelLoaded = true;
          this.isModelLoading = false;
          console.log('Speech-to-text model loaded successfully');
          resolve(true);
        });
      } catch (error) {
        console.error('Error loading speech-to-text model:', error);
        this.isModelLoaded = false;
        this.isModelLoading = false;
        resolve(false);
      }
    });

    return this.modelLoadPromise;
  }

  /**
   * Transcribe audio to text
   * @param {Buffer} audioBuffer - Audio buffer
   * @param {Object} options - Transcription options
   * @returns {Promise<Object>} Transcription result
   */
  async transcribe(audioBuffer, options = {}) {
    return await createSpan('ai.speechToText.transcribe', { 
      audioLength: audioBuffer.length,
      language: options.language || SPEECH_TO_TEXT_CONFIG.defaultLanguage
    }, async () => {
      // Ensure model is loaded
      const modelLoaded = await this.loadModel();
      if (!modelLoaded) {
        throw new Error('Failed to load speech-to-text model');
      }

      // Validate input
      if (!audioBuffer || audioBuffer.length === 0) {
        throw new Error('Audio buffer is empty');
      }

      // Set default options
      const transcriptionOptions = {
        language: options.language || SPEECH_TO_TEXT_CONFIG.defaultLanguage,
        task: options.task || 'transcribe',
        detectLanguage: options.detectLanguage || false,
        timestamps: options.timestamps || false,
        speakerDiarization: options.speakerDiarization || false,
        maxSpeakers: options.maxSpeakers || 2,
        prompt: options.prompt || '',
        audioFormat: options.audioFormat || SPEECH_TO_TEXT_CONFIG.audioFormat,
        sampleRate: options.sampleRate || SPEECH_TO_TEXT_CONFIG.sampleRate
      };

      // Validate language
      if (!SPEECH_TO_TEXT_CONFIG.supportedLanguages.includes(transcriptionOptions.language)) {
        console.warn(`Language ${transcriptionOptions.language} not supported. Using ${SPEECH_TO_TEXT_CONFIG.defaultLanguage} instead.`);
        transcriptionOptions.language = SPEECH_TO_TEXT_CONFIG.defaultLanguage;
      }

      // Check audio length
      const audioLengthSeconds = audioBuffer.length / (transcriptionOptions.sampleRate * 2); // 16-bit audio
      
      if (audioLengthSeconds > SPEECH_TO_TEXT_CONFIG.maxAudioLength) {
        console.warn(`Audio length (${audioLengthSeconds}s) exceeds maximum (${SPEECH_TO_TEXT_CONFIG.maxAudioLength}s). Splitting into chunks.`);
        return this._transcribeLongAudio(audioBuffer, transcriptionOptions);
      }

      // Transcribe audio
      const result = await this.model.transcribe(audioBuffer, transcriptionOptions);
      
      // Format result
      return {
        id: uuidv4(),
        text: result.text,
        language: result.language || transcriptionOptions.language,
        segments: result.segments || [],
        words: result.words || [],
        confidence: result.confidence || 0.0,
        metadata: {
          audioLength: audioLengthSeconds,
          model: SPEECH_TO_TEXT_CONFIG.modelSize,
          task: transcriptionOptions.task,
          generatedAt: new Date().toISOString(),
          ...options.metadata
        }
      };
    });
  }

  /**
   * Transcribe long audio by splitting into chunks
   * @param {Buffer} audioBuffer - Audio buffer
   * @param {Object} options - Transcription options
   * @returns {Promise<Object>} Combined transcription result
   * @private
   */
  async _transcribeLongAudio(audioBuffer, options) {
    return await createSpan('ai.speechToText._transcribeLongAudio', { 
      audioLength: audioBuffer.length
    }, async () => {
      // Calculate chunk size in bytes
      const bytesPerSecond = options.sampleRate * 2; // 16-bit audio
      const chunkSizeBytes = SPEECH_TO_TEXT_CONFIG.chunkSize * bytesPerSecond;
      
      // Split audio into chunks
      const chunks = [];
      for (let i = 0; i < audioBuffer.length; i += chunkSizeBytes) {
        chunks.push(audioBuffer.slice(i, i + chunkSizeBytes));
      }
      
      console.log(`Split audio into ${chunks.length} chunks`);
      
      // Transcribe each chunk
      const results = [];
      for (let i = 0; i < chunks.length; i++) {
        console.log(`Transcribing chunk ${i + 1}/${chunks.length}`);
        
        // Add context from previous chunk if available
        let prompt = options.prompt || '';
        if (i > 0 && results.length > 0) {
          // Use last few words from previous chunk as context
          const lastResult = results[results.length - 1];
          const words = lastResult.text.split(' ');
          const contextWords = words.slice(Math.max(0, words.length - 10)).join(' ');
          prompt = contextWords + ' ' + prompt;
        }
        
        // Transcribe chunk
        const chunkOptions = {
          ...options,
          prompt
        };
        
        const result = await this.model.transcribe(chunks[i], chunkOptions);
        results.push(result);
      }
      
      // Combine results
      const combinedText = results.map(r => r.text).join(' ');
      
      // Combine segments
      const combinedSegments = [];
      let segmentOffset = 0;
      
      for (const result of results) {
        if (result.segments && result.segments.length > 0) {
          for (const segment of result.segments) {
            combinedSegments.push({
              ...segment,
              start: segment.start + segmentOffset,
              end: segment.end + segmentOffset
            });
          }
        }
        
        // Update offset for next chunk
        segmentOffset += SPEECH_TO_TEXT_CONFIG.chunkSize;
      }
      
      // Format combined result
      return {
        id: uuidv4(),
        text: combinedText,
        language: results[0].language || options.language,
        segments: combinedSegments,
        words: [], // Words timing not reliable across chunks
        confidence: results.reduce((sum, r) => sum + (r.confidence || 0), 0) / results.length,
        metadata: {
          audioLength: audioBuffer.length / (options.sampleRate * 2),
          model: SPEECH_TO_TEXT_CONFIG.modelSize,
          task: options.task,
          chunks: chunks.length,
          generatedAt: new Date().toISOString(),
          ...options.metadata
        }
      };
    });
  }

  /**
   * Transcribe audio stream in real-time
   * @param {ReadableStream} audioStream - Audio stream
   * @param {Object} options - Transcription options
   * @param {Function} callback - Callback function for receiving transcription updates
   * @returns {Promise<void>} Resolves when transcription is complete
   */
  async transcribeStream(audioStream, options = {}, callback) {
    return await createSpan('ai.speechToText.transcribeStream', { 
      language: options.language || SPEECH_TO_TEXT_CONFIG.defaultLanguage
    }, async () => {
      // Ensure model is loaded
      const modelLoaded = await this.loadModel();
      if (!modelLoaded) {
        throw new Error('Failed to load speech-to-text model');
      }

      // Set default options
      const transcriptionOptions = {
        language: options.language || SPEECH_TO_TEXT_CONFIG.defaultLanguage,
        task: options.task || 'transcribe',
        detectLanguage: options.detectLanguage || false,
        interim: options.interim !== false,
        audioFormat: options.audioFormat || SPEECH_TO_TEXT_CONFIG.audioFormat,
        sampleRate: options.sampleRate || SPEECH_TO_TEXT_CONFIG.sampleRate,
        chunkDuration: options.chunkDuration || 2 // 2 seconds per chunk
      };

      // Validate language
      if (!SPEECH_TO_TEXT_CONFIG.supportedLanguages.includes(transcriptionOptions.language)) {
        console.warn(`Language ${transcriptionOptions.language} not supported. Using ${SPEECH_TO_TEXT_CONFIG.defaultLanguage} instead.`);
        transcriptionOptions.language = SPEECH_TO_TEXT_CONFIG.defaultLanguage;
      }

      // Calculate chunk size in bytes
      const bytesPerSecond = transcriptionOptions.sampleRate * 2; // 16-bit audio
      const chunkSizeBytes = transcriptionOptions.chunkDuration * bytesPerSecond;
      
      // Buffer for accumulating audio data
      let buffer = Buffer.alloc(0);
      let isFirstChunk = true;
      let detectedLanguage = transcriptionOptions.language;
      let transcriptSoFar = '';
      
      // Process audio stream
      audioStream.on('data', async (chunk) => {
        // Add chunk to buffer
        buffer = Buffer.concat([buffer, chunk]);
        
        // Process buffer when it reaches chunk size
        if (buffer.length >= chunkSizeBytes) {
          const audioChunk = buffer.slice(0, chunkSizeBytes);
          buffer = buffer.slice(chunkSizeBytes);
          
          // Detect language on first chunk if requested
          if (isFirstChunk && transcriptionOptions.detectLanguage) {
            try {
              const detection = await this._detectLanguage(audioChunk, transcriptionOptions);
              detectedLanguage = detection.language;
              console.log(`Detected language: ${detectedLanguage}`);
            } catch (error) {
              console.error('Error detecting language:', error);
            }
            
            isFirstChunk = false;
          }
          
          // Transcribe chunk
          const chunkOptions = {
            ...transcriptionOptions,
            language: detectedLanguage,
            prompt: transcriptSoFar.split(' ').slice(-10).join(' ') // Use last 10 words as context
          };
          
          try {
            const result = await this.model.transcribe(audioChunk, chunkOptions);
            
            // Update transcript
            transcriptSoFar += ' ' + result.text;
            transcriptSoFar = transcriptSoFar.trim();
            
            // Format result
            const formattedResult = {
              id: uuidv4(),
              text: result.text,
              transcript_so_far: transcriptSoFar,
              is_final: false,
              language: detectedLanguage,
              segments: result.segments || [],
              confidence: result.confidence || 0.0,
              metadata: {
                chunk_duration: transcriptionOptions.chunkDuration,
                model: SPEECH_TO_TEXT_CONFIG.modelSize,
                task: transcriptionOptions.task,
                timestamp: new Date().toISOString()
              }
            };
            
            // Send result to callback
            callback(null, formattedResult);
          } catch (error) {
            console.error('Error transcribing chunk:', error);
            callback(error, null);
          }
        }
      });
      
      // Handle end of stream
      audioStream.on('end', async () => {
        // Process remaining buffer
        if (buffer.length > 0) {
          try {
            const result = await this.model.transcribe(buffer, {
              ...transcriptionOptions,
              language: detectedLanguage,
              prompt: transcriptSoFar.split(' ').slice(-10).join(' ')
            });
            
            // Update transcript
            transcriptSoFar += ' ' + result.text;
            transcriptSoFar = transcriptSoFar.trim();
            
            // Format final result
            const formattedResult = {
              id: uuidv4(),
              text: result.text,
              transcript_so_far: transcriptSoFar,
              is_final: true,
              language: detectedLanguage,
              segments: result.segments || [],
              confidence: result.confidence || 0.0,
              metadata: {
                chunk_duration: buffer.length / bytesPerSecond,
                model: SPEECH_TO_TEXT_CONFIG.modelSize,
                task: transcriptionOptions.task,
                timestamp: new Date().toISOString()
              }
            };
            
            // Send final result to callback
            callback(null, formattedResult);
          } catch (error) {
            console.error('Error transcribing final chunk:', error);
            callback(error, null);
          }
        } else {
          // Send final empty result
          callback(null, {
            id: uuidv4(),
            text: '',
            transcript_so_far: transcriptSoFar,
            is_final: true,
            language: detectedLanguage,
            segments: [],
            confidence: 1.0,
            metadata: {
              chunk_duration: 0,
              model: SPEECH_TO_TEXT_CONFIG.modelSize,
              task: transcriptionOptions.task,
              timestamp: new Date().toISOString()
            }
          });
        }
      });
      
      // Handle errors
      audioStream.on('error', (error) => {
        console.error('Audio stream error:', error);
        callback(error, null);
      });
    });
  }

  /**
   * Detect language from audio
   * @param {Buffer} audioBuffer - Audio buffer
   * @param {Object} options - Detection options
   * @returns {Promise<Object>} Language detection result
   * @private
   */
  async _detectLanguage(audioBuffer, options) {
    return await createSpan('ai.speechToText._detectLanguage', { 
      audioLength: audioBuffer.length
    }, async () => {
      // In a real implementation, this would:
      // 1. Use a language detection model or API
      // 2. Return the detected language and confidence
      
      // Simplified implementation for demonstration
      return {
        language: options.language || SPEECH_TO_TEXT_CONFIG.defaultLanguage,
        confidence: 0.9
      };
    });
  }

  /**
   * Call the Whisper API
   * @param {Buffer} audioBuffer - Audio buffer
   * @param {Object} options - Transcription options
   * @returns {Promise<Object>} API response
   * @private
   */
  async _callWhisperAPI(audioBuffer, options) {
    let retries = 0;
    
    while (retries < SPEECH_TO_TEXT_CONFIG.maxRetries) {
      try {
        // Save audio to temporary file
        const tempFilePath = path.join(
          SPEECH_TO_TEXT_CONFIG.tempAudioPath,
          `${uuidv4()}.${options.audioFormat || SPEECH_TO_TEXT_CONFIG.audioFormat}`
        );
        
        fs.writeFileSync(tempFilePath, audioBuffer);
        
        // Create form data
        const formData = new FormData();
        formData.append('file', fs.createReadStream(tempFilePath));
        formData.append('model', SPEECH_TO_TEXT_CONFIG.modelSize);
        formData.append('language', options.language);
        formData.append('task', options.task);
        formData.append('timestamps', options.timestamps ? 'true' : 'false');
        
        if (options.prompt) {
          formData.append('prompt', options.prompt);
        }
        
        if (options.speakerDiarization) {
          formData.append('diarize', 'true');
          formData.append('speakers', options.maxSpeakers.toString());
        }
        
        // Call API
        const response = await axios.post(
          SPEECH_TO_TEXT_CONFIG.apiEndpoint,
          formData,
          {
            headers: {
              'Content-Type': 'multipart/form-data',
              'Authorization': `Bearer ${SPEECH_TO_TEXT_CONFIG.apiKey}`
            },
            timeout: 60000 // 60 seconds
          }
        );
        
        // Clean up temporary file
        fs.unlinkSync(tempFilePath);
        
        return response.data;
      } catch (error) {
        retries++;
        
        if (retries >= SPEECH_TO_TEXT_CONFIG.maxRetries) {
          throw new Error(`API call failed after ${retries} retries: ${error.message}`);
        }
        
        // Exponential backoff
        const delay = SPEECH_TO_TEXT_CONFIG.retryDelay * Math.pow(2, retries - 1);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  /**
   * Simulate transcription for demonstration
   * @param {Buffer} audioBuffer - Audio buffer
   * @param {Object} options - Transcription options
   * @returns {Promise<Object>} Simulated transcription
   * @private
   */
  async _simulateTranscription(audioBuffer, options) {
    // Calculate audio length in seconds
    const audioLengthSeconds = audioBuffer.length / (options.sampleRate * 2); // 16-bit audio
    
    // Generate random text based on audio length
    const wordsPerSecond = 2.5; // Average speaking rate
    const wordCount = Math.floor(audioLengthSeconds * wordsPerSecond);
    
    // Sample sentences for simulation
    const sentences = [
      "Hello, this is a test of the speech recognition system.",
      "The quick brown fox jumps over the lazy dog.",
      "Welcome to the unified communications hub.",
      "Today we'll discuss the implementation of our new features.",
      "Please let me know if you have any questions or concerns.",
      "The meeting will start in five minutes.",
      "I think we should focus on improving the user experience.",
      "Let's schedule a follow-up meeting next week.",
      "The results of our recent tests are very promising.",
      "We need to address the security concerns before proceeding."
    ];
    
    // Generate text
    let text = '';
    let wordsSoFar = 0;
    
    while (wordsSoFar < wordCount) {
      const sentence = sentences[Math.floor(Math.random() * sentences.length)];
      text += sentence + ' ';
      wordsSoFar += sentence.split(' ').length;
    }
    
    text = text.trim();
    
    // Generate segments
    const segments = [];
    let startTime = 0;
    let words = text.split(' ');
    
    for (let i = 0; i < words.length; i += 10) {
      const segmentWords = words.slice(i, i + 10);
      const segmentText = segmentWords.join(' ');
      const segmentDuration = segmentWords.length / wordsPerSecond;
      
      segments.push({
        id: i / 10,
        start: startTime,
        end: startTime + segmentDuration,
        text: segmentText,
        confidence: 0.8 + Math.random() * 0.2
      });
      
      startTime += segmentDuration;
    }
    
    // Generate word-level timestamps
    const wordTimestamps = [];
    startTime = 0;
    
    for (const word of words) {
      const wordDuration = 0.4 * (1 + Math.random() * 0.5); // 0.4-0.6 seconds per word
      
      wordTimestamps.push({
        word,
        start: startTime,
        end: startTime + wordDuration,
        confidence: 0.7 + Math.random() * 0.3
      });
      
      startTime += wordDuration;
    }
    
    // Simulate processing delay
    await new Promise(resolve => setTimeout(resolve, Math.min(500, audioLengthSeconds * 50)));
    
    return {
      text,
      language: options.language,
      segments,
      words: options.timestamps ? wordTimestamps : [],
      confidence: 0.85 + Math.random() * 0.15
    };
  }
}

// Export singleton instance
const speechToText = new SpeechToText();
module.exports = speechToText;
