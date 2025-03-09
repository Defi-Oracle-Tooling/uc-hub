const { PubSub, withFilter } = require('graphql-subscriptions');
const { UserInputError, AuthenticationError } = require('apollo-server-express');
const mongoose = require('mongoose');
const User = require('./models/User');
const Message = require('./models/Message');
const Meeting = require('./models/Meeting');
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
  MEETING_PARTICIPANT_JOINED: 'MEETING_PARTICIPANT_JOINED'
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
    }
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
    
    sendMessage: async (_, { content, conversationId, recipients, platform }, { user }) => {
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
    }
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
    }
  }
};

module.exports = resolvers;
