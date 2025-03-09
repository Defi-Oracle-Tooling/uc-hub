const { PubSub, withFilter } = require('graphql-subscriptions');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const config = require('config');
const { UserInputError, AuthenticationError } = require('apollo-server-express');
const mongoose = require('mongoose');
const User = require('./models/User');
const Message = require('./models/Message');
const Meeting = require('./models/Meeting');
const Conversation = require('./models/Conversation');
const { ERROR_TYPES, createGraphQLError } = require('./utils/errorHandler');

// Create PubSub instance for handling subscriptions
const pubsub = new PubSub();

// Subscription events
const EVENTS = {
  NEW_MESSAGE: 'NEW_MESSAGE',
  MESSAGE_UPDATED: 'MESSAGE_UPDATED',
  USER_PRESENCE_CHANGED: 'USER_PRESENCE_CHANGED',
  USER_TYPING: 'USER_TYPING',
  MEETING_UPDATED: 'MEETING_UPDATED',
  MEETING_PARTICIPANT_JOINED: 'MEETING_PARTICIPANT_JOINED',
  MESSAGE_CREATED: 'MESSAGE_CREATED',
  MESSAGE_DELETED: 'MESSAGE_DELETED',
  USER_PRESENCE: 'USER_PRESENCE'
};

// Verify subscription authentication context
const verifySubscriptionAuth = async (connectionParams) => {
  if (!connectionParams.authToken) {
    throw new AuthenticationError('Missing auth token');
  }

  try {
    const decoded = jwt.verify(connectionParams.authToken, process.env.JWT_SECRET);
    const user = await User.findById(decoded.id).select('-password');
    if (!user) {
      throw new Error('User not found');
    }
    return { user };
  } catch (error) {
    throw new AuthenticationError('Invalid auth token');
  }
};

// Sample resolvers for UC-Hub GraphQL API
const resolvers = {
  Query: {
    getCurrentUser: async (_, __, { user }) => {
      if (!user) {
        throw createGraphQLError('Not authenticated', ERROR_TYPES.AUTHENTICATION);
      }
      return user;
    },
    
    getUser: async (_, { id }) => {
      try {
        return await User.findById(id);
      } catch (error) {
        throw createGraphQLError(`Error fetching user: ${error.message}`, ERROR_TYPES.NOT_FOUND);
      }
    },
    
    getUsers: async () => {
      try {
        return await User.find({});
      } catch (error) {
        throw createGraphQLError(`Error fetching users: ${error.message}`, ERROR_TYPES.INTERNAL);
      }
    },
    
    conversations: async (_, __, { user }) => {
      if (!user) {
        throw createGraphQLError('Not authenticated', ERROR_TYPES.AUTHENTICATION);
      }
      
      try {
        // Find conversations where the user is a participant
        const conversations = await Conversation.find({
          'participants.user': user.id
        }).populate('participants.user lastMessage');
        
        return conversations;
      } catch (error) {
        throw createGraphQLError(`Error fetching conversations: ${error.message}`, ERROR_TYPES.INTERNAL);
      }
    },
    
    conversation: async (_, { id }, { user }) => {
      if (!user) {
        throw createGraphQLError('Not authenticated', ERROR_TYPES.AUTHENTICATION);
      }
      
      try {
        const conversation = await Conversation.findById(id)
          .populate('participants.user lastMessage');
          
        if (!conversation) {
          throw createGraphQLError('Conversation not found', ERROR_TYPES.NOT_FOUND);
        }
        
        // Check if user is participant
        const isParticipant = conversation.participants.some(
          p => p.user.id.toString() === user.id.toString()
        );
        
        if (!isParticipant) {
          throw createGraphQLError('Not authorized to access this conversation', ERROR_TYPES.AUTHORIZATION);
        }
        
        return conversation;
      } catch (error) {
        throw createGraphQLError(`Error fetching conversation: ${error.message}`, 
          error.extensions?.code || ERROR_TYPES.INTERNAL);
      }
    },
    
    messages: async (_, { conversationId, limit = 50, offset = 0 }, { user }) => {
      if (!user) {
        throw createGraphQLError('Not authenticated', ERROR_TYPES.AUTHENTICATION);
      }
      
      try {
        // Fetch messages for the conversation
        return await Message.find({ conversation: conversationId })
          .sort({ createdAt: -1 })
          .skip(offset)
          .limit(limit)
          .populate('sender');
      } catch (error) {
        throw createGraphQLError(`Error fetching messages: ${error.message}`, ERROR_TYPES.INTERNAL);
      }
    },
    
    meetings: async (_, { upcoming = true, limit = 10, offset = 0 }, { user }) => {
      if (!user) {
        throw createGraphQLError('Not authenticated', ERROR_TYPES.AUTHENTICATION);
      }
      
      try {
        // Query filter based on upcoming parameter
        const filter = {
          $or: [
            { organizer: user.id },
            { 'participants.user': user.id }
          ]
        };
        
        if (upcoming) {
          filter.startTime = { $gte: new Date() };
          filter.status = { $ne: 'cancelled' };
        }
        
        return await Meeting.find(filter)
          .sort({ startTime: 1 })
          .skip(offset)
          .limit(limit)
          .populate('organizer participants.user');
      } catch (error) {
        throw createGraphQLError(`Error fetching meetings: ${error.message}`, ERROR_TYPES.INTERNAL);
      }
    },
    
    meeting: async (_, { id }, { user }) => {
      if (!user) {
        throw createGraphQLError('Not authenticated', ERROR_TYPES.AUTHENTICATION);
      }
      
      try {
        const meeting = await Meeting.findById(id)
          .populate('organizer participants.user');
          
        if (!meeting) {
          throw createGraphQLError('Meeting not found', ERROR_TYPES.NOT_FOUND);
        }
        
        // Check if user is organizer or participant
        const isOrganizer = meeting.organizer.id.toString() === user.id.toString();
        const isParticipant = meeting.participants.some(
          p => p.user.id.toString() === user.id.toString()
        );
        
        if (!isOrganizer && !isParticipant) {
          throw createGraphQLError('Not authorized to access this meeting', ERROR_TYPES.AUTHORIZATION);
        }
        
        return meeting;
      } catch (error) {
        throw createGraphQLError(`Error fetching meeting: ${error.message}`, 
          error.extensions?.code || ERROR_TYPES.INTERNAL);
      }
    },
    
    me: async (_, __, { user }) => {
      if (!user) throw new Error('Not authenticated');
      return await User.findById(user.id);
    },
    users: async () => await User.find({}),
    user: async (_, { id }) => await User.findById(id),
    conversations: async (_, __, { user }) => {
      if (!user) throw new Error('Not authenticated');
      return await Conversation.find({ participants: user.id })
        .populate('participants')
        .populate('lastMessage');
    },
    conversation: async (_, { id }, { user }) => {
      if (!user) throw new Error('Not authenticated');
      return await Conversation.findById(id)
        .populate('participants')
        .populate({
          path: 'messages',
          populate: { path: 'sender' }
        });
    },
    messages: async (_, { conversationId, limit = 50, offset = 0 }, { user }) => {
      if (!user) throw new Error('Not authenticated');
      return await Message.find({ conversationId })
        .sort({ createdAt: -1 })
        .skip(offset)
        .limit(limit)
        .populate('sender')
        .populate('recipients');
    },
  },
  
  Mutation: {
    login: async (_, { email, password }) => {
      try {
        // Find user by email
        const user = await User.findOne({ email }).select('+password');
        
        if (!user) {
          throw createGraphQLError('Invalid credentials', ERROR_TYPES.AUTHENTICATION);
        }
        
        // Check password
        const isMatch = await user.matchPassword(password);
        if (!isMatch) {
          throw createGraphQLError('Invalid credentials', ERROR_TYPES.AUTHENTICATION);
        }
        
        // Update last login
        user.lastLogin = Date.now();
        await user.save();
        
        // Generate tokens
        const token = user.generateToken();
        const refreshToken = user.generateToken('7d'); // 7 days for refresh token
        
        return {
          token,
          refreshToken,
          user
        };
      } catch (error) {
        throw createGraphQLError(`Login failed: ${error.message}`, 
          error.extensions?.code || ERROR_TYPES.AUTHENTICATION);
      }
    },
    
    register: async (_, { name, email, password }) => {
      try {
        // Check if user already exists
        let user = await User.findOne({ email });
        
        if (user) {
          throw createGraphQLError('User already exists with this email', ERROR_TYPES.BAD_INPUT);
        }
        
        // Create new user
        user = await User.create({
          name,
          email,
          password
        });
        
        // Generate tokens
        const token = user.generateToken();
        const refreshToken = user.generateToken('7d');
        
        return {
          token,
          refreshToken,
          user
        };
      } catch (error) {
        throw createGraphQLError(`Registration failed: ${error.message}`, 
          error.extensions?.code || ERROR_TYPES.BAD_INPUT);
      }
    },
    
    sendMessage: async (_, { content, conversationId, recipients, platform }, { user, webSocketHandler }) => {
      if (!user) {
        throw createGraphQLError('Not authenticated', ERROR_TYPES.AUTHENTICATION);
      }
      
      try {
        // Create new message
        const message = await Message.create({
          content,
          sender: user.id,
          conversation: conversationId,
          recipients,
          platform: platform || 'internal',
          createdAt: new Date()
        });
        
        // Populate sender details
        await message.populate('sender');
        
        // Update conversation's lastMessage
        if (conversationId) {
          await Conversation.findByIdAndUpdate(conversationId, {
            lastMessage: message.id,
            updatedAt: new Date()
          });
        }
        
        // Publish event for subscriptions
        pubsub.publish(EVENTS.NEW_MESSAGE, { 
          newMessage: message,
          conversationId
        });

        const populatedMessage = await message
          .populate('sender')
          .populate('recipients')
          .execPopulate();

        // Publish to GraphQL subscriptions
        pubsub.publish(EVENTS.MESSAGE_CREATED, {
          messageCreated: populatedMessage,
          conversationId
        });

        // Notify via WebSocket
        if (webSocketHandler) {
          webSocketHandler.sendToConversation(conversationId, 'new_message', populatedMessage);
        }
        
        return message;
      } catch (error) {
        throw createGraphQLError(`Failed to send message: ${error.message}`, ERROR_TYPES.INTERNAL);
      }
    },
    
    createConversation: async (_, { title, participants, platform }, { user }) => {
      if (!user) {
        throw createGraphQLError('Not authenticated', ERROR_TYPES.AUTHENTICATION);
      }
      
      try {
        // Ensure current user is included in participants
        if (!participants.includes(user.id)) {
          participants.push(user.id);
        }
        
        // Format participants for the conversation model
        const participantsData = participants.map(userId => ({
          user: userId,
          role: userId === user.id ? 'organizer' : 'attendee'
        }));
        
        // Create conversation
        const conversation = await Conversation.create({
          title,
          platform,
          participants: participantsData,
          createdAt: new Date(),
          updatedAt: new Date()
        });
        
        // Populate participants
        await conversation.populate('participants.user');
        
        return conversation;
      } catch (error) {
        throw createGraphQLError(`Failed to create conversation: ${error.message}`, ERROR_TYPES.INTERNAL);
      }
    },
    
    scheduleMeeting: async (_, { meeting }, { user }) => {
      if (!user) {
        throw createGraphQLError('Not authenticated', ERROR_TYPES.AUTHENTICATION);
      }
      
      try {
        // Format participants
        const participants = meeting.participants.map(userId => ({
          user: userId,
          role: userId === user.id ? 'organizer' : 'attendee',
          status: 'pending'
        }));
        
        // Create meeting
        const newMeeting = await Meeting.create({
          ...meeting,
          organizer: user.id,
          participants,
          status: 'scheduled',
          createdAt: new Date()
        });
        
        // Populate organizer and participants
        await newMeeting.populate('organizer participants.user');
        
        // Publish meeting update event
        pubsub.publish(EVENTS.MEETING_UPDATED, {
          meetingUpdated: newMeeting
        });
        
        return newMeeting;
      } catch (error) {
        throw createGraphQLError(`Failed to schedule meeting: ${error.message}`, ERROR_TYPES.INTERNAL);
      }
    },

    updateMessage: async (_, { id, content }, { user, webSocketHandler }) => {
      if (!user) throw new Error('Not authenticated');

      const message = await Message.findById(id);
      if (!message) throw new Error('Message not found');
      if (message.sender.toString() !== user.id) throw new Error('Not authorized');

      const updatedMessage = await Message.findByIdAndUpdate(
        id,
        { content, updatedAt: new Date() },
        { new: true }
      ).populate('sender').populate('recipients');

      // Publish to GraphQL subscriptions
      pubsub.publish(EVENTS.MESSAGE_UPDATED, {
        messageUpdated: updatedMessage,
        conversationId: message.conversationId
      });

      // Notify via WebSocket
      if (webSocketHandler) {
        webSocketHandler.sendToConversation(
          message.conversationId,
          'message_updated',
          updatedMessage
        );
      }

      return updatedMessage;
    },

    deleteMessage: async (_, { id }, { user, webSocketHandler }) => {
      if (!user) throw new Error('Not authenticated');

      const message = await Message.findById(id);
      if (!message) throw new Error('Message not found');
      if (message.sender.toString() !== user.id) throw new Error('Not authorized');

      const conversationId = message.conversationId;
      await Message.findByIdAndDelete(id);

      // Publish to GraphQL subscriptions
      pubsub.publish(EVENTS.MESSAGE_DELETED, {
        messageDeleted: id,
        conversationId
      });

      // Notify via WebSocket
      if (webSocketHandler) {
        webSocketHandler.sendToConversation(
          conversationId,
          'message_deleted',
          { messageId: id }
        );
      }

      return true;
    },
  },
  
  Subscription: {
    newMessage: {
      subscribe: withFilter(
        () => pubsub.asyncIterator([EVENTS.NEW_MESSAGE]),
        (payload, variables, { user }) => {
          if (!user) return false;
          
          // Only send to clients that are subscribed to this conversation
          return payload.conversationId === variables.conversationId;
        }
      )
    },
    
    messageUpdated: {
      subscribe: withFilter(
        () => pubsub.asyncIterator([EVENTS.MESSAGE_UPDATED]),
        (payload, variables, { user }) => {
          if (!user) return false;
          
          // Only send to clients that are subscribed to this conversation
          return payload.conversationId === variables.conversationId;
        }
      )
    },
    
    userPresenceChanged: {
      subscribe: withFilter(
        () => pubsub.asyncIterator([EVENTS.USER_PRESENCE_CHANGED]),
        (payload, variables, { user }) => {
          if (!user) return false;
          
          // If conversationId is provided, only send to that conversation
          if (variables.conversationId) {
            return payload.conversationId === variables.conversationId;
          }
          
          // Otherwise, send to all clients (for global presence)
          return true;
        }
      )
    },
    
    userTyping: {
      subscribe: withFilter(
        () => pubsub.asyncIterator([EVENTS.USER_TYPING]),
        (payload, variables, { user }) => {
          if (!user) return false;
          
          // Only send typing events for the specified conversation
          return payload.conversationId === variables.conversationId;
        }
      )
    },
    
    meetingUpdated: {
      subscribe: withFilter(
        () => pubsub.asyncIterator([EVENTS.MEETING_UPDATED]),
        async (payload, variables, { user }) => {
          if (!user) return false;
          
          const meeting = payload.meetingUpdated;
          
          // Only send to organizer and participants
          return (
            meeting.organizer.toString() === user.id.toString() ||
            meeting.participants.some(p => p.user.toString() === user.id.toString())
          );
        }
      )
    },

    messageCreated: {
      subscribe: withFilter(
        (_, args, context) => {
          if (!context.user) {
            throw new AuthenticationError('Not authenticated');
          }
          return pubsub.asyncIterator(EVENTS.MESSAGE_CREATED);
        },
        async (payload, variables, context) => {
          try {
            const conversation = await Conversation.findById(variables.conversationId);
            if (!conversation) return false;

            // Verify user is participant in conversation
            return conversation.participants.some(
              p => p.user.toString() === context.user.id.toString()
            );
          } catch (error) {
            console.error('Subscription filter error:', error);
            return false;
          }
        }
      )
    },

    messageUpdated: {
      subscribe: withFilter(
        (_, args, context) => {
          if (!context.user) {
            throw new AuthenticationError('Not authenticated');
          }
          return pubsub.asyncIterator(EVENTS.MESSAGE_UPDATED);
        },
        async (payload, variables, context) => {
          try {
            const conversation = await Conversation.findById(variables.conversationId);
            if (!conversation) return false;

            return conversation.participants.some(
              p => p.user.toString() === context.user.id.toString()
            );
          } catch (error) {
            console.error('Subscription filter error:', error);
            return false;
          }
        }
      )
    },

    messageDeleted: {
      subscribe: withFilter(
        (_, args, context) => {
          if (!context.user) {
            throw new AuthenticationError('Not authenticated');
          }
          return pubsub.asyncIterator(EVENTS.MESSAGE_DELETED);
        },
        async (payload, variables, context) => {
          try {
            const conversation = await Conversation.findById(variables.conversationId);
            if (!conversation) return false;

            return conversation.participants.some(
              p => p.user.toString() === context.user.id.toString()
            );
          } catch (error) {
            console.error('Subscription filter error:', error);
            return false;
          }
        }
      )
    },

    userPresence: {
      subscribe: withFilter(
        (_, args, context) => {
          if (!context.user) {
            throw new AuthenticationError('Not authenticated');
          }
          return pubsub.asyncIterator(EVENTS.USER_PRESENCE);
        },
        async (payload, variables, context) => {
          const { filter } = variables;
          
          if (filter.conversationId) {
            // If conversation specific, verify user is participant
            const conversation = await Conversation.findById(filter.conversationId);
            if (!conversation) return false;

            return conversation.participants.some(
              p => p.user.toString() === context.user.id.toString()
            );
          }

          // For user specific presence, anyone can subscribe
          if (filter.userId) {
            return true;
          }

          return false;
        }
      )
    },

    userTyping: {
      subscribe: withFilter(
        (_, args, context) => {
          if (!context.user) {
            throw new AuthenticationError('Not authenticated');
          }
          return pubsub.asyncIterator(EVENTS.USER_TYPING);
        },
        async (payload, variables, context) => {
          try {
            const conversation = await Conversation.findById(variables.conversationId);
            if (!conversation) return false;

            return conversation.participants.some(
              p => p.user.toString() === context.user.id.toString()
            );
          } catch (error) {
            console.error('Subscription filter error:', error);
            return false;
          }
        }
      )
    },

    meetingUpdated: {
      subscribe: withFilter(
        (_, args, context) => {
          if (!context.user) {
            throw new AuthenticationError('Not authenticated');
          }
          return pubsub.asyncIterator(EVENTS.MEETING_UPDATED);
        },
        async (payload, variables, context) => {
          try {
            const meeting = await Meeting.findById(variables.meetingId);
            if (!meeting) return false;

            // Allow if user is organizer or participant
            return (
              meeting.organizer.toString() === context.user.id.toString() ||
              meeting.participants.some(p => p.user.toString() === context.user.id.toString())
            );
          } catch (error) {
            console.error('Subscription filter error:', error);
            return false;
          }
        }
      )
    }
  }
};

module.exports = {
  resolvers,
  pubsub,
  verifySubscriptionAuth
};
