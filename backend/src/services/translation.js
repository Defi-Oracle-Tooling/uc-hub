const axios = require('axios');
const config = require('config');
const redis = require('../utils/redis');
const { CACHE_KEYS } = require('../constants');

class TranslationService {
  constructor() {
    this.baseUrl = config.get('services.translation.url');
    this.apiKey = config.get('services.translation.apiKey');
    this.cacheTimeout = 3600; // Cache translations for 1 hour
  }

  async translateMessage(text, targetLanguage, sourceLanguage = null) {
    try {
      // Generate cache key
      const cacheKey = this.getCacheKey(text, targetLanguage, sourceLanguage);
      
      // Check cache first
      const cachedTranslation = await this.getCachedTranslation(cacheKey);
      if (cachedTranslation) {
        return JSON.parse(cachedTranslation);
      }

      // Call translation API
      const response = await axios.post(`${this.baseUrl}/translate`, {
        text,
        targetLanguage,
        sourceLanguage
      }, {
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json'
        }
      });

      const result = {
        translatedText: response.data.translatedText,
        detectedLanguage: response.data.detectedLanguage,
        confidence: response.data.confidence
      };

      // Cache the result
      await this.cacheTranslation(cacheKey, result);

      return result;
    } catch (error) {
      console.error('Translation error:', error);
      throw new Error('Translation failed');
    }
  }

  async detectLanguage(text) {
    try {
      const response = await axios.post(`${this.baseUrl}/detect`, {
        text
      }, {
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json'
        }
      });

      return {
        language: response.data.language,
        confidence: response.data.confidence
      };
    } catch (error) {
      console.error('Language detection error:', error);
      throw new Error('Language detection failed');
    }
  }

  async translateBatch(messages, targetLanguage) {
    try {
      const messagesToTranslate = [];
      const cachedTranslations = new Map();

      // Check cache for each message
      for (const message of messages) {
        const cacheKey = this.getCacheKey(message.content, targetLanguage);
        const cached = await this.getCachedTranslation(cacheKey);
        
        if (cached) {
          cachedTranslations.set(message.id, JSON.parse(cached));
        } else {
          messagesToTranslate.push(message);
        }
      }

      if (messagesToTranslate.length === 0) {
        return messages.map(msg => cachedTranslations.get(msg.id));
      }

      // Translate uncached messages
      const response = await axios.post(`${this.baseUrl}/translate-batch`, {
        messages: messagesToTranslate.map(msg => ({
          id: msg.id,
          text: msg.content
        })),
        targetLanguage
      }, {
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json'
        }
      });

      // Cache new translations
      for (const translation of response.data.translations) {
        const message = messagesToTranslate.find(msg => msg.id === translation.id);
        const cacheKey = this.getCacheKey(message.content, targetLanguage);
        await this.cacheTranslation(cacheKey, {
          translatedText: translation.translatedText,
          detectedLanguage: translation.detectedLanguage,
          confidence: translation.confidence
        });
      }

      // Combine cached and new translations
      return messages.map(message => {
        return cachedTranslations.get(message.id) || 
          response.data.translations.find(t => t.id === message.id);
      });
    } catch (error) {
      console.error('Batch translation error:', error);
      throw new Error('Batch translation failed');
    }
  }

  getCacheKey(text, targetLanguage, sourceLanguage = '') {
    const hash = this.hashText(text);
    return `${CACHE_KEYS.TRANSLATION}:${hash}:${targetLanguage}:${sourceLanguage}`;
  }

  async getCachedTranslation(key) {
    return await redis.get(key);
  }

  async cacheTranslation(key, translation) {
    await redis.setex(key, this.cacheTimeout, JSON.stringify(translation));
  }

  hashText(text) {
    const crypto = require('crypto');
    return crypto.createHash('md5').update(text).digest('hex');
  }

  getSupportedLanguages() {
    return [
      { code: 'en', name: 'English' },
      { code: 'es', name: 'Spanish' },
      { code: 'fr', name: 'French' },
      { code: 'de', name: 'German' },
      { code: 'it', name: 'Italian' },
      { code: 'pt', name: 'Portuguese' },
      { code: 'ru', name: 'Russian' },
      { code: 'zh', name: 'Chinese' },
      { code: 'ja', name: 'Japanese' },
      { code: 'ko', name: 'Korean' },
      { code: 'ar', name: 'Arabic' },
      { code: 'hi', name: 'Hindi' }
    ];
  }
}

module.exports = new TranslationService();