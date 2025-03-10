const { gql } = require('apollo-server-express');

const typeDefs = gql`
  type User {
    id: ID!
    name: String!
    email: String!
    avatar: String
    status: String
    lastSeen: String
    teamsConnection: TeamsConnectionStatus
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
    language: String
    confidence: Float
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
    conversationId: ID!
    platform: String
    createdAt: String!
    updatedAt: String
    readBy: [User!]
    status: String
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
    participants: [User!]!
    messages: [Message!]!
    lastMessage: Message
    updatedAt: String!
    createdAt: String!
    name: String
    type: String
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
    conversation: ID
  }

  type Query {
    me: User
    users: [User!]!
    user(id: ID!): User
    conversations: [Conversation!]!
    conversation(id: ID!): Conversation
    messages(conversationId: ID!, limit: Int, offset: Int): [Message!]!
    getCurrentUser: User
    getUser(id: ID!): User
    getUsers: [User!]
    meetings(upcoming: Boolean, limit: Int, offset: Int): [Meeting!]
    meeting(id: ID!): Meeting
    teamsAuthUrl: String!
    teamsConnectionStatus: TeamsConnectionStatus!
  }

  type Mutation {
    login(email: String!, password: String!): AuthPayload!
    register(name: String!, email: String!, password: String!): AuthPayload!
    sendMessage(content: String!, recipients: [ID!]!, conversationId: ID!, platform: String): Message!
    updateMessage(id: ID!, content: String!): Message!
    deleteMessage(id: ID!): Boolean!
    updateUserStatus(status: String!): User!
    updateUserPreferences(preferences: UserPreferencesInput!): User
    createConversation(title: String!, participants: [ID!]!, platform: String!): Conversation
    addParticipantToConversation(conversationId: ID!, userId: ID!): Conversation
    scheduleMeeting(meeting: MeetingInput!): Meeting
    updateMeeting(id: ID!, meeting: MeetingUpdateInput!): Meeting
    cancelMeeting(id: ID!): Meeting
    joinMeeting(id: ID!): Meeting
    connectTeams(code: String!, state: String!): TeamsAuthResponse!
    disconnectTeams: Boolean!
  }

  enum SubscriptionEvent {
    MESSAGE_CREATED
    MESSAGE_UPDATED
    MESSAGE_DELETED
    USER_PRESENCE
    USER_TYPING
    MEETING_UPDATED
  }

  input SubscriptionFilter {
    event: SubscriptionEvent!
    conversationId: ID
    userId: ID
  }

  type Subscription {
    messageCreated(conversationId: ID!): Message!
    messageUpdated(conversationId: ID!): Message!
    messageDeleted(conversationId: ID!): ID!
    userPresence(filter: SubscriptionFilter!): UserPresence!
    userTyping(conversationId: ID!): UserTypingEvent!
    meetingUpdated(meetingId: ID!): Meeting!
    meetingParticipantJoined(meetingId: ID!): MeetingParticipant
  }

  type UserTypingEvent {
    user: User!
    conversationId: ID!
    isTyping: Boolean!
    timestamp: String!
  }

  type AuthPayload {
    token: String!
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

  type TeamsAuthResponse {
    success: Boolean!
    error: String
  }

  type TeamsConnectionStatus {
    isConnected: Boolean!
    email: String
    name: String
  }
`;

module.exports = typeDefs;
