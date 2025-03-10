import React, { useState, useEffect } from 'react';
import { format } from 'date-fns';
import { TranslationControls } from './TranslationControls';

const MessageBubble = ({ message, isTranslationEnabled, targetLanguage }) => {
  const [translatedContent, setTranslatedContent] = useState('');
  const [isTranslating, setIsTranslating] = useState(false);
  const [translation, setTranslation] = useState(null);
  const [showTranslation, setShowTranslation] = useState(false);
  const [showTranslationControls, setShowTranslationControls] = useState(false);

  const formatTime = (dateString) => {
    return format(new Date(dateString), 'h:mm a');
  };

  const handleTranslation = (newTranslation) => {
    setTranslation(newTranslation);
    setShowTranslation(true);
  };

  const toggleTranslation = () => {
    if (translation) {
      setShowTranslation(!showTranslation);
    }
  };

  const messageContent = showTranslation ? translation?.text : message.content;

  // Handle translation when enabled
  useEffect(() => {
    const translateMessage = async () => {
      if (!isTranslationEnabled || !message.content || message.language === targetLanguage) {
        setTranslatedContent('');
        return;
      }

      try {
        setIsTranslating(true);
        // Call translation service here
        // For now, we'll just show a placeholder
        setTranslatedContent(`[Translated to ${targetLanguage}]: ${message.content}`);
      } catch (error) {
        console.error('Translation error:', error);
        setTranslatedContent('');
      } finally {
        setIsTranslating(false);
      }
    };

    translateMessage();
  }, [message.content, isTranslationEnabled, targetLanguage, message.language]);

  return (
    <div className={`flex ${message.isCurrentUser ? 'justify-end' : 'justify-start'}`}>
      <div className={`max-w-[75%] sm:max-w-[60%] ${message.isCurrentUser ? 'order-1' : 'order-2'}`}>
        {!message.isCurrentUser && (
          <div className="ml-2 mb-1">
            <span className="text-xs text-gray-500">{message.sender.name}</span>
          </div>
        )}
        
        <div className={`rounded-lg px-4 py-2 ${
          message.isCurrentUser 
            ? 'bg-primary-600 text-white' 
            : 'bg-white border border-gray-200'
        }`}>
          <p className={`text-sm ${message.isCurrentUser ? 'text-white' : 'text-gray-900'}`}>
            {messageContent}
          </p>
          
          {isTranslationEnabled && isTranslating && (
            <div className="mt-1">
              <div className="animate-pulse flex space-x-2 items-center">
                <div className="h-2 w-2 bg-current rounded-full opacity-75"></div>
                <div className="h-2 w-2 bg-current rounded-full opacity-50"></div>
                <div className="h-2 w-2 bg-current rounded-full opacity-25"></div>
              </div>
            </div>
          )}
          
          {translatedContent && (
            <p className={`mt-1 text-sm ${
              message.isCurrentUser ? 'text-primary-100' : 'text-gray-500'
            }`}>
              {translatedContent}
            </p>
          )}

          {translation && (
            <button
              onClick={toggleTranslation}
              className="text-xs underline mt-1 opacity-75 hover:opacity-100"
            >
              {showTranslation ? 'Show original' : 'Show translation'}
            </button>
          )}
          
          <div className={`mt-1 text-xs ${
            message.isCurrentUser ? 'text-primary-100' : 'text-gray-400'
          } flex items-center space-x-2`}>
            <span>{formatTime(message.createdAt)}</span>
            {message.status && (
              <span className="flex items-center">
                • 
                {message.status === 'sent' && (
                  <svg className="ml-1 h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                )}
                {message.status === 'delivered' && (
                  <svg className="ml-1 h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7M5 13l4 4L19 7" />
                  </svg>
                )}
                {message.status === 'read' && (
                  <svg className="ml-1 h-3 w-3 fill-current" viewBox="0 0 24 24">
                    <path d="M5 13l4 4L19 7M5 13l4 4L19 7" />
                  </svg>
                )}
              </span>
            )}
            <button
              onClick={() => setShowTranslationControls(!showTranslationControls)}
              className="ml-2 underline hover:opacity-100"
            >
              {showTranslationControls ? 'Hide translation' : 'Translate'}
            </button>
          </div>

          {showTranslationControls && (
            <div className="mt-2">
              <TranslationControls
                messageId={message.id}
                originalText={message.content}
                onTranslation={handleTranslation}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default MessageBubble;