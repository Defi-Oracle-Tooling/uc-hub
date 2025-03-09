const { gql } = require('apollo-server-express');

const typeDefs = gql`
  type User {
    id: ID!
    name: String!
    email: String!
    role: String
    preferences: UserPreferences
    lastLogin: String
  }

  type UserPreferences {
    defaultPlatform: String
    language: String
    notificationsEnabled: Boolean
    theme: String
  }

  type MessageMetadata {
    translated: Boolean
    translatedContent: String
    originalLanguage: String
    readBy: [MessageReadStatus]
  }

  type MessageReadStatus {
    user: User!
    timestamp: String!
  }

  type Message {
    id: ID!
    content: String!
    sender: User!
    recipients: [User!]
    conversation: Conversation
    platform: String!
    metadata: MessageMetadata
    attachments: [Attachment]
    createdAt: String!
    updatedAt: String
  }

  type Attachment {
    id: ID!
    type: String!
    url: String!
    filename: String
    size: Int
    mimeType: String
  }

  type Conversation {
    id: ID!
    title: String!
    platform: String!
    participants: [User!]!
    messages: [Message!]
    lastMessage: Message
    createdAt: String!
    updatedAt: String!
  }

  type Meeting {
    id: ID!
    title: String!
    description: String
    organizer: User!
    startTime: String!
    endTime: String
    timezone: String
    platform: String!
    participants: [MeetingParticipant!]
    joinUrl: String
    recordingUrl: String
    status: String
    summary: String
    transcription: String
    createdAt: String!
  }

  type MeetingParticipant {
    user: User!
    role: String!
    status: String!
    joinedAt: String
    leftAt: String
  }

  type UserPresence {
    userId: ID!
    name: String!
    status: String!
    lastActive: String
  }

  type Query {
    getCurrentUser: User
    getUser(id: ID!): User
    getUsers: [User!]
    
    conversations: [Conversation!]
    conversation(id: ID!): Conversation
    
    messages(conversationId: ID!, limit: Int, offset: Int): [Message!]
    message(id: ID!): Message
    
    meetings(upcoming: Boolean, limit: Int, offset: Int): [Meeting!]
    meeting(id: ID!): Meeting
  }

  type Mutation {
    # User mutations
    login(email: String!, password: String!): AuthPayload
    register(name: String!, email: String!, password: String!): AuthPayload
    updateUserPreferences(preferences: UserPreferencesInput!): User
    
    # Message mutations
    sendMessage(content: String!, conversationId: ID!, recipients: [ID!], platform: String!): Message
    translateMessage(messageId: ID!, targetLanguage: String!): Message
    markMessageAsRead(messageId: ID!): Message
    
    # Conversation mutations
    createConversation(title: String!, participants: [ID!]!, platform: String!): Conversation
    addParticipantToConversation(conversationId: ID!, userId: ID!): Conversation
    
    # Meeting mutations
    scheduleMeeting(meeting: MeetingInput!): Meeting
    updateMeeting(id: ID!, meeting: MeetingUpdateInput!): Meeting
    cancelMeeting(id: ID!): Meeting
    joinMeeting(id: ID!): Meeting
  }

  type Subscription {
    # Real-time message subscriptions
    newMessage(conversationId: ID!): Message
    messageUpdated(conversationId: ID!): Message
    
    # User presence subscriptions
    userPresenceChanged(conversationId: ID): UserPresence
    userTyping(conversationId: ID!): UserTypingEvent
    
    # Meeting subscriptions
    meetingUpdated(id: ID!): Meeting
    meetingParticipantJoined(meetingId: ID!): MeetingParticipant
  }

  type UserTypingEvent {
    user: User!
    conversationId: ID!
    isTyping: Boolean!
  }

  type AuthPayload {
    token: String!
    refreshToken: String!
    user: User!
  }

  input UserPreferencesInput {
    defaultPlatform: String
    language: String
    notificationsEnabled: Boolean
    theme: String
  }

  input MeetingInput {
    title: String!
    description: String
    startTime: String!
    endTime: String
    timezone: String
    platform: String!
    participants: [ID!]!
    isRecurring: Boolean
    recurringPattern: RecurringPatternInput
  }

  input MeetingUpdateInput {
    title: String
    description: String
    startTime: String
    endTime: String
    participants: [ID!]
    status: String
  }

  input RecurringPatternInput {
    frequency: String!
    interval: Int!
    daysOfWeek: [Int]
    endDate: String
    occurrences: Int
  }
`;

module.exports = typeDefs;
