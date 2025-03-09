import React, { useState, useEffect } from 'react';
import { gql, useQuery } from '@apollo/client';
import ChatWindow from '../components/ChatWindow';

// GraphQL query to get all conversations
const GET_CONVERSATIONS = gql`
  query GetConversations {
    conversations {
      id
      title
      platform
      participants {
        id
        name
        email
      }
      lastMessage {
        id
        content
        createdAt
        sender {
          id
          name
        }
      }
      updatedAt
    }
  }
`;

// GraphQL query to get messages for a specific conversation
const GET_MESSAGES = gql`
  query GetMessages($conversationId: ID!, $limit: Int, $offset: Int) {
    messages(
      conversationId: $conversationId
      limit: $limit
      offset: $offset
    ) {
      id
      content
      sender {
        id
        name
      }
      createdAt
      metadata {
        translated
        translatedContent
        originalLanguage
      }
    }
  }
`;

/**
 * Messages page component
 * Displays the list of conversations and chat interface
 */
const Messages = () => {
  const [activeConversation, setActiveConversation] = useState(null);
  const [user, setUser] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');

  // Get user from localStorage
  useEffect(() => {
    const userData = localStorage.getItem('user');
    if (userData) {
      setUser(JSON.parse(userData));
    }
  }, []);

  // Fetch conversations
  const { 
    loading: loadingConversations, 
    error: conversationError, 
    data: conversationData 
  } = useQuery(GET_CONVERSATIONS);

  // Fetch messages for active conversation
  const { 
    loading: loadingMessages, 
    error: messagesError, 
    data: messagesData,
    refetch: refetchMessages 
  } = useQuery(GET_MESSAGES, {
    variables: { 
      conversationId: activeConversation?.id || '',
      limit: 50,
      offset: 0
    },
    skip: !activeConversation,
    fetchPolicy: 'network-only'
  });

  // Filter conversations by search term
  const filteredConversations = React.useMemo(() => {
    if (!conversationData?.conversations) return [];
    
    if (!searchTerm) return conversationData.conversations;
    
    return conversationData.conversations.filter(convo => 
      convo.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      convo.participants.some(p => 
        p.name.toLowerCase().includes(searchTerm.toLowerCase())
      )
    );
  }, [conversationData, searchTerm]);

  // Set first conversation as active if none selected and data loaded
  useEffect(() => {
    if (!activeConversation && filteredConversations.length > 0) {
      setActiveConversation(filteredConversations[0]);
    }
  }, [filteredConversations, activeConversation]);

  // Format the conversation date 
  const formatConversationDate = (dateString) => {
    const date = new Date(dateString);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    
    if (date.toDateString() === today.toDateString()) {
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } else if (date.toDateString() === yesterday.toDateString()) {
      return 'Yesterday';
    } else {
      return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    }
  };

  return (
    <div className="h-[calc(100vh-120px)] flex rounded-lg overflow-hidden border border-gray-200 bg-white shadow-sm">
      {/* Sidebar - Conversation List */}
      <div className="w-1/3 border-r border-gray-200 bg-gray-50 flex flex-col">
        <div className="p-3 border-b border-gray-200">
          <input
            type="text"
            placeholder="Search conversations..."
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary-500"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <div className="flex-1 overflow-y-auto">
          {loadingConversations ? (
            <div className="flex justify-center p-10">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-500"></div>
            </div>
          ) : conversationError ? (
            <div className="text-center p-6 text-red-500">
              Error loading conversations. Please try again later.
            </div>
          ) : filteredConversations.length === 0 ? (
            <div className="text-center p-6 text-gray-500">
              No conversations found.
            </div>
          ) : (
            filteredConversations.map((conversation) => (
              <div
                key={conversation.id}
                className={`flex p-3 border-b border-gray-200 hover:bg-gray-100 cursor-pointer ${
                  activeConversation?.id === conversation.id ? 'bg-primary-50' : ''
                }`}
                onClick={() => setActiveConversation(conversation)}
              >
                <div className="h-12 w-12 rounded-full bg-primary-100 flex items-center justify-center">
                  <span className="text-primary-800 font-medium">
                    {conversation.title[0].toUpperCase()}
                  </span>
                </div>
                <div className="ml-3 flex-1 min-w-0">
                  <div className="flex justify-between items-baseline">
                    <h3 className="text-sm font-medium text-gray-900 truncate">
                      {conversation.title}
                    </h3>
                    <span className="text-xs text-gray-500">
                      {formatConversationDate(conversation.updatedAt)}
                    </span>
                  </div>
                  <div className="flex items-start">
                    <p className="text-sm text-gray-500 truncate">
                      {conversation.lastMessage ? (
                        <>
                          <span className="font-medium">
                            {conversation.lastMessage.sender.id === user?.id
                              ? 'You: '
                              : `${conversation.lastMessage.sender.name}: `}
                          </span>
                          {conversation.lastMessage.content}
                        </>
                      ) : (
                        'No messages yet'
                      )}
                    </p>
                    {/* Badge for platform indicator */}
                    <span className="ml-2 px-1.5 py-0.5 bg-gray-100 text-gray-600 rounded text-xs">
                      {conversation.platform}
                    </span>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
        <div className="p-3 border-t border-gray-200">
          <button className="w-full flex items-center justify-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-primary-600 hover:bg-primary-700">
            <svg className="mr-2 h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6"></path>
            </svg>
            New Conversation
          </button>
        </div>
      </div>
      
      {/* Main Chat Area */}
      <div className="w-2/3 flex flex-col">
        {activeConversation ? (
          <ChatWindow 
            conversation={activeConversation}
            messages={messagesData?.messages || []}
            loading={loadingMessages}
            currentUser={user}
          />
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-gray-500">
            <svg className="w-16 h-16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"></path>
            </svg>
            <p className="mt-3 text-center">
              Select a conversation to start chatting or create a new one.
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default Messages;
