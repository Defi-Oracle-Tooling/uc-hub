import { useEffect, useState } from 'react';
import { useSubscription, gql } from '@apollo/client';
import websocketService from '../services/websocket';

const MESSAGE_SUBSCRIPTION = gql`
  subscription OnMessageCreated($conversationId: ID!) {
    messageCreated(conversationId: $conversationId) {
      id
      content
      sender {
        id
        name
        avatar
      }
      createdAt
      status
    }
  }
`;

export const useMessageSubscription = (conversationId) => {
  const [typingUsers, setTypingUsers] = useState(new Set());
  const [onlineUsers, setOnlineUsers] = useState(new Set());

  const { data, loading, error } = useSubscription(MESSAGE_SUBSCRIPTION, {
    variables: { conversationId },
  });

  useEffect(() => {
    // Handle typing status updates
    const handleTypingStatus = ({ userId, isTyping }) => {
      setTypingUsers(prev => {
        const newSet = new Set(prev);
        if (isTyping) {
          newSet.add(userId);
        } else {
          newSet.delete(userId);
        }
        return newSet;
      });
    };

    // Handle presence updates
    const handlePresence = ({ userId, status }) => {
      setOnlineUsers(prev => {
        const newSet = new Set(prev);
        if (status === 'online') {
          newSet.add(userId);
        } else {
          newSet.delete(userId);
        }
        return newSet;
      });
    };

    websocketService.on('typing_status', handleTypingStatus);
    websocketService.on('presence', handlePresence);

    return () => {
      websocketService.off('typing_status', handleTypingStatus);
      websocketService.off('presence', handlePresence);
    };
  }, []);

  const sendTypingStatus = (isTyping) => {
    websocketService.sendTypingStatus(conversationId, isTyping);
  };

  const markMessageAsRead = (messageId) => {
    websocketService.markMessageAsRead(messageId, conversationId);
  };

  return {
    newMessage: data?.messageCreated,
    loading,
    error,
    typingUsers: Array.from(typingUsers),
    onlineUsers: Array.from(onlineUsers),
    sendTypingStatus,
    markMessageAsRead,
  };
};

export default useMessageSubscription;