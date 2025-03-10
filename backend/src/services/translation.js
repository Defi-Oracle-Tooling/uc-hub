const axios = require('axios');
const config = require('config');
const redis = require('../utils/redis');

class TranslationService {
  constructor() {
    this.modelUrl = config.get('ai.translationModel.url');
    this.cachePrefix = 'translation:';
    this.cacheTTL = 24 * 60 * 60; // 24 hours
  }

  async translateText(text, targetLanguage, sourceLanguage = null) {
    const cacheKey = this._getCacheKey(text, targetLanguage, sourceLanguage);
    
    // Check cache first
    const cached = await redis.get(cacheKey);
    if (cached) {
      return JSON.parse(cached);
    }

    try {
      // If source language not provided, detect it
      if (!sourceLanguage) {
        sourceLanguage = await this.detectLanguage(text);
      }

      // Don't translate if source and target languages are the same
      if (sourceLanguage === targetLanguage) {
        return {
          translatedText: text,
          detectedLanguage: sourceLanguage,
          confidence: 1.0
        };
      }

      // Call translation model
      const response = await axios.post(this.modelUrl + '/translate', {
        text,
        source_language: sourceLanguage,
        target_language: targetLanguage
      });

      const result = {
        translatedText: response.data.translated_text,
        detectedLanguage: sourceLanguage,
        confidence: response.data.confidence
      };

      // Cache the result
      await redis.setex(cacheKey, this.cacheTTL, JSON.stringify(result));

      return result;
    } catch (error) {
      console.error('Translation error:', error);
      throw new Error('Failed to translate text');
    }
  }

  async detectLanguage(text) {
    const cacheKey = this._getCacheKey(text, 'detect');
    
    // Check cache first
    const cached = await redis.get(cacheKey);
    if (cached) {
      return cached;
    }

    try {
      const response = await axios.post(this.modelUrl + '/detect', {
        text
      });

      const detectedLanguage = response.data.detected_language;

      // Cache the result
      await redis.setex(cacheKey, this.cacheTTL, detectedLanguage);

      return detectedLanguage;
    } catch (error) {
      console.error('Language detection error:', error);
      throw new Error('Failed to detect language');
    }
  }

  _getCacheKey(text, targetLanguage, sourceLanguage = '') {
    const hash = require('crypto')
      .createHash('md5')
      .update(text)
      .digest('hex');
    return `${this.cachePrefix}${hash}:${sourceLanguage}:${targetLanguage}`;
  }
}

module.exports = new TranslationService();