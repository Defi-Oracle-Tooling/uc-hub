const { gql } = require('apollo-server-express');

const typeDefs = gql`
  type User {
    id: ID!
    name: String!
    email: String!
    preferences: UserPreferences
  }

  type UserPreferences {
    defaultPlatform: String
    language: String
    notificationsEnabled: Boolean
  }

  type Message {
    id: ID!
    content: String!
    sender: User!
    timestamp: String!
    platform: String!
    translated: Boolean
  }

  type Meeting {
    id: ID!
    title: String!
    startTime: String!
    endTime: String
    platform: String!
    participants: [User!]
    summary: String
  }

  type Query {
    getUser(id: ID!): User
    getMessages(platformFilter: String): [Message!]
    getMeetings(upcoming: Boolean): [Meeting!]
  }

  type Mutation {
    createUser(name: String!, email: String!, password: String!): User
    updateUserPreferences(userId: ID!, preferences: UserPreferencesInput!): User
    sendMessage(content: String!, platform: String!, recipients: [ID!]!): Message
    scheduleMeeting(title: String!, platform: String!, startTime: String!, participants: [ID!]!): Meeting
  }

  input UserPreferencesInput {
    defaultPlatform: String
    language: String
    notificationsEnabled: Boolean
  }
`;

module.exports = typeDefs;
