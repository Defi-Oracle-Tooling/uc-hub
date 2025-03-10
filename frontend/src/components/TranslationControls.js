import React, { useState } from 'react';
import { useTranslation } from '../hooks/useTranslation';

const TranslationControls = ({ messageId, onTranslationChange }) => {
  const {
    supportedLanguages,
    targetLanguage,
    setTargetLanguage,
    translate,
    getTranslation,
    hasTranslation
  } = useTranslation();

  const [isTranslating, setIsTranslating] = useState(false);
  const [error, setError] = useState(null);

  const handleLanguageChange = async (language) => {
    setError(null);
    setIsTranslating(true);
    setTargetLanguage(language);

    try {
      if (!hasTranslation(messageId, language)) {
        await translate(messageId, language);
      }
      const translation = getTranslation(messageId, language);
      onTranslationChange(translation);
    } catch (err) {
      setError('Translation failed. Please try again.');
      console.error('Translation error:', err);
    } finally {
      setIsTranslating(false);
    }
  };

  if (!supportedLanguages.length) {
    return null;
  }

  return (
    <div className="flex items-center space-x-2 text-sm">
      <select
        className="form-select text-sm rounded-md border-gray-300 focus:border-indigo-500 focus:ring-indigo-500"
        value={targetLanguage || ''}
        onChange={(e) => handleLanguageChange(e.target.value)}
        disabled={isTranslating}
      >
        <option value="">Translate to...</option>
        {supportedLanguages.map((lang) => (
          <option key={lang.code} value={lang.code}>
            {lang.name} ({lang.nativeName})
          </option>
        ))}
      </select>

      {isTranslating && (
        <div className="text-gray-500">
          <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>
        </div>
      )}

      {error && (
        <span className="text-red-500 text-xs">{error}</span>
      )}
    </div>
  );
};

export default TranslationControls;