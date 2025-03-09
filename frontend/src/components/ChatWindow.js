import React, { useState, useEffect, useRef } from 'react';
import { gql, useMutation } from '@apollo/client';
import useMessageSubscription from '../hooks/useMessageSubscription';

// GraphQL mutation for sending messages
const SEND_MESSAGE = gql`
  mutation SendMessage($content: String!, $recipients: [ID!], $conversationId: ID!, $platform: String!) {
    sendMessage(
      content: $content
      recipients: $recipients
      conversationId: $conversationId
      platform: $platform
    ) {
      id
      content
      sender {
        id
        name
      }
      createdAt
    }
  }
`;

/**
 * ChatWindow component for displaying and sending messages
 */
const ChatWindow = ({ conversation, messages, onSendMessage }) => {
  const [messageText, setMessageText] = useState('');
  const [sendingMessage, setSendingMessage] = useState(false);
  const messagesEndRef = useRef(null);
  const messageListRef = useRef(null);
  const typingTimeoutRef = useRef(null);
  const [isTranslationEnabled, setIsTranslationEnabled] = useState(false);
  const [targetLanguage, setTargetLanguage] = useState('en');
  const [localMessages, setLocalMessages] = useState(messages);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [touchStart, setTouchStart] = useState(null);
  const [touchEnd, setTouchEnd] = useState(null);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  // Send message mutation
  const [sendMessage] = useMutation(SEND_MESSAGE);

  // Handle real-time message updates using our subscription hook
  const { sendTypingStatus, typingUsers, onlineUsers } = useMessageSubscription({
    conversationId: conversation?.id,
    onNewMessage: (newMessage) => {
      setLocalMessages(prev => {
        if (!prev.some(msg => msg.id === newMessage.id)) {
          return [...prev, newMessage].sort((a, b) => 
            new Date(a.createdAt) - new Date(b.createdAt)
          );
        }
        return prev;
      });
    }
  });

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    scrollToBottom();
  }, [localMessages]);

  const scrollToBottom = (behavior = 'smooth') => {
    messagesEndRef.current?.scrollIntoView({ behavior });
  };

  // Handle pull-to-refresh gesture
  const handleTouchStart = (e) => {
    setTouchStart(e.touches[0].clientY);
  };

  const handleTouchMove = (e) => {
    setTouchEnd(e.touches[0].clientY);
  };

  const handleTouchEnd = async () => {
    if (!touchStart || !touchEnd) return;

    const distance = touchEnd - touchStart;
    const isTop = messageListRef.current?.scrollTop === 0;
    const minSwipeDistance = 50;

    if (distance > minSwipeDistance && isTop && !isRefreshing) {
      setIsRefreshing(true);
      // Implement message refresh logic here
      await loadMoreMessages();
      setIsRefreshing(false);
    }

    setTouchStart(null);
    setTouchEnd(null);
  };

  // Handle typing indicators
  const handleTyping = () => {
    sendTypingStatus(true);
    
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }
    
    typingTimeoutRef.current = setTimeout(() => {
      sendTypingStatus(false);
    }, 2000);
  };

  // Handle message submission
  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!messageText.trim() || sendingMessage || !conversation) return;
    
    try {
      setSendingMessage(true);
      
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
        sendTypingStatus(false);
      }

      await sendMessage({
        variables: {
          content: messageText,
          conversationId: conversation.id,
        }
      });

      setMessageText('');
    } catch (error) {
      console.error('Error sending message:', error);
    } finally {
      setSendingMessage(false);
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Chat Header */}
      <div className="p-4 border-b border-gray-200 bg-white">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            {/* Mobile menu button */}
            <button
              className="sm:hidden p-2 rounded-md hover:bg-gray-100"
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            >
              <svg className="h-6 w-6 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
            
            <div>
              <h2 className="text-lg font-semibold">{conversation?.title || 'Chat'}</h2>
              <div className="flex items-center space-x-2 mt-1">
                <p className="text-sm text-gray-500">
                  {conversation?.participants?.length || 0} participants
                </p>
                {onlineUsers.size > 0 && (
                  <span className="text-xs text-green-600">
                    • {onlineUsers.size} online
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <button 
              className={`px-3 py-1 rounded-md text-xs font-medium ${
                isTranslationEnabled ? 'bg-primary-100 text-primary-800' : 'bg-gray-100 text-gray-600'
              }`}
              onClick={() => setIsTranslationEnabled(!isTranslationEnabled)}
            >
              {isTranslationEnabled ? 'Translation On' : 'Translation Off'}
            </button>
            {isTranslationEnabled && (
              <select 
                value={targetLanguage}
                onChange={(e) => setTargetLanguage(e.target.value)}
                className="bg-white border border-gray-300 rounded-md text-xs px-2 py-1"
              >
                <option value="en">English</option>
                <option value="es">Spanish</option>
                <option value="fr">French</option>
                <option value="de">German</option>
                <option value="zh">Chinese</option>
              </select>
            )}
          </div>
        </div>

        {/* Show typing indicators */}
        {typingUsers.size > 0 && (
          <div className="mt-1">
            <p className="text-xs text-gray-500 italic">
              {Array.from(typingUsers).join(', ')} 
              {typingUsers.size === 1 ? ' is ' : ' are '}
              typing...
            </p>
          </div>
        )}
      </div>

      {/* Mobile menu */}
      {isMobileMenuOpen && (
        <div className="sm:hidden border-b border-gray-200 bg-white">
          <div className="p-4 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-600">Participants</span>
              <span className="text-sm text-gray-900">{conversation?.participants?.length || 0}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-600">Platform</span>
              <span className="text-sm text-gray-900">{conversation?.platform || 'internal'}</span>
            </div>
          </div>
        </div>
      )}

      {/* Messages area */}
      <div 
        ref={messageListRef}
        className="flex-1 overflow-y-auto p-4 space-y-3 bg-gray-50"
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        {/* Pull to refresh indicator */}
        {isRefreshing && (
          <div className="flex justify-center py-2">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary-500"></div>
          </div>
        )}

        {localMessages.map((message) => (
          <MessageBubble
            key={message.id}
            message={message}
            isTranslationEnabled={isTranslationEnabled}
            targetLanguage={targetLanguage}
          />
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* Message input */}
      <div className="p-4 bg-white border-t border-gray-200">
        <form onSubmit={handleSubmit} className="flex space-x-2">
          <input
            type="text"
            value={messageText}
            onChange={(e) => {
              setMessageText(e.target.value);
              handleTyping();
            }}
            placeholder="Type a message..."
            className="flex-1 rounded-md border border-gray-300 px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
          />
          <button
            type="submit"
            disabled={!messageText.trim() || sendingMessage}
            className="bg-primary-600 text-white px-4 py-2 rounded-md hover:bg-primary-700 disabled:bg-primary-300 text-sm font-medium flex items-center"
          >
            {sendingMessage ? (
              <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
            ) : (
              <span>Send</span>
            )}
          </button>
        </form>
      </div>
    </div>
  );
};

export default ChatWindow;