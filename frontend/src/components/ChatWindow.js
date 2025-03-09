import React, { useState, useEffect, useRef } from 'react';
import { gql, useMutation, useSubscription } from '@apollo/client';

// GraphQL query definitions
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

const MESSAGE_SUBSCRIPTION = gql`
  subscription OnNewMessage($conversationId: ID!) {
    newMessage(conversationId: $conversationId) {
      id
      content
      sender {
        id
        name
      }
      metadata {
        translated
        translatedContent
      }
      createdAt
    }
  }
`;

/**
 * ChatWindow component for displaying and sending messages
 */
const ChatWindow = ({ 
  conversation, 
  messages = [], 
  loading = false, 
  currentUser,
  onSendMessage 
}) => {
  const [messageText, setMessageText] = useState('');
  const messagesEndRef = useRef(null);
  const [isTranslationEnabled, setIsTranslationEnabled] = useState(false);
  const [targetLanguage, setTargetLanguage] = useState('en');
  
  // Handle real-time messages via GraphQL subscription
  const { data: subscriptionData } = useSubscription(
    MESSAGE_SUBSCRIPTION,
    { variables: { conversationId: conversation?.id }, skip: !conversation?.id }
  );

  // Send message mutation
  const [sendMessage, { loading: sendingMessage }] = useMutation(SEND_MESSAGE);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    scrollToBottom();
  }, [messages, subscriptionData]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  // Handle message submission
  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!messageText.trim() || sendingMessage || !conversation) return;
    
    try {
      // Custom handler for parent component if provided
      if (onSendMessage) {
        await onSendMessage(messageText);
        setMessageText('');
        return;
      }
      
      // Default GraphQL mutation if no custom handler
      await sendMessage({
        variables: {
          content: messageText,
          conversationId: conversation.id,
          recipients: conversation.participants?.map(p => p.id) || [],
          platform: conversation.platform || 'internal'
        }
      });
      
      setMessageText('');
    } catch (error) {
      console.error('Failed to send message:', error);
    }
  };

  // Format timestamp to readable time
  const formatTime = (timestamp) => {
    if (!timestamp) return '';
    const date = new Date(timestamp);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };
  
  // Toggle translation feature
  const toggleTranslation = () => {
    setIsTranslationEnabled(!isTranslationEnabled);
  };
  
  // Combine initial messages with subscription data
  const allMessages = React.useMemo(() => {
    const existingMessages = [...messages];
    
    if (subscriptionData?.newMessage) {
      const newMessage = subscriptionData.newMessage;
      if (!existingMessages.some(msg => msg.id === newMessage.id)) {
        existingMessages.push(newMessage);
      }
    }
    
    return existingMessages.sort((a, b) => {
      return new Date(a.createdAt) - new Date(b.createdAt);
    });
  }, [messages, subscriptionData]);

  return (
    <div className="flex flex-col h-full bg-white rounded-lg shadow-sm overflow-hidden">
      {/* Chat header */}
      <div className="bg-gray-50 px-4 py-3 border-b flex justify-between items-center">
        <div>
          <h3 className="text-base font-semibold text-gray-900">
            {conversation?.title || 'Chat'}
          </h3>
          <p className="text-sm text-gray-500">
            {conversation?.participants?.length || 0} participants
          </p>
        </div>
        <div className="flex space-x-2">
          <button 
            className={`px-3 py-1 rounded-md text-xs font-medium ${
              isTranslationEnabled ? 'bg-primary-100 text-primary-800' : 'bg-gray-100 text-gray-600'
            }`}
            onClick={toggleTranslation}
          >
            {isTranslationEnabled ? 'Translation On' : 'Translation Off'}
          </button>
          {isTranslationEnabled && (
            <select 
              value={targetLanguage}
              onChange={(e) => setTargetLanguage(e.target.value)}
              className="bg-white border border-gray-300 rounded-md text-xs px-2"
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
      
      {/* Messages area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {loading ? (
          <div className="flex justify-center my-6">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-500"></div>
          </div>
        ) : allMessages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-gray-500">
            <svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"></path>
            </svg>
            <p className="mt-2 text-sm">No messages yet. Start the conversation!</p>
          </div>
        ) : (
          allMessages.map((message) => (
            <div 
              key={message.id} 
              className={`flex ${
                message.sender?.id === currentUser?.id ? 'justify-end' : 'justify-start'
              }`}
            >
              <div 
                className={`max-w-[75%] rounded-lg px-4 py-2 ${
                  message.sender?.id === currentUser?.id 
                    ? 'bg-primary-100 text-gray-900' 
                    : 'bg-gray-100 text-gray-900'
                }`}
              >
                {message.sender?.id !== currentUser?.id && (
                  <p className="text-xs font-medium text-gray-500 mb-1">
                    {message.sender?.name}
                  </p>
                )}
                <p>{isTranslationEnabled && message.metadata?.translatedContent ? 
                  message.metadata.translatedContent : 
                  message.content
                }</p>
                <p className="text-xs text-gray-500 mt-1 text-right">
                  {formatTime(message.createdAt)}
                  {isTranslationEnabled && message.metadata?.translated && (
                    <span className="ml-1 italic">(translated)</span>
                  )}
                </p>
              </div>
            </div>
          ))
        )}
        <div ref={messagesEndRef} />
      </div>
      
      {/* Message input */}
      <form onSubmit={handleSubmit} className="border-t p-3 bg-white">
        <div className="flex">
          <input
            type="text"
            placeholder="Type a message..."
            value={messageText}
            onChange={(e) => setMessageText(e.target.value)}
            className="flex-1 border border-gray-300 rounded-l-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary-500"
            disabled={sendingMessage}
          />
          <button
            type="submit"
            disabled={!messageText.trim() || sendingMessage}
            className="bg-primary-600 text-white px-4 py-2 rounded-r-md hover:bg-primary-700 disabled:bg-primary-300 text-sm font-medium"
          >
            {sendingMessage ? (
              <span className="flex items-center justify-center">
                <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Sending
              </span>
            ) : (
              'Send'
            )}
          </button>
        </div>
      </form>
    </div>
  );
};

export default ChatWindow;