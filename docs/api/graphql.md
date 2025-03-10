# UC-Hub GraphQL API Documentation

## Overview

The UC-Hub GraphQL API provides a unified interface for accessing and manipulating data across all integrated communication platforms. This API allows clients to query and mutate data using a single endpoint, regardless of the underlying platform.

## Base URL

```
https://api.uc-hub.example.com/graphql
```

## Authentication

All GraphQL requests must include a valid JWT token in the Authorization header:

```
Authorization: Bearer <your_jwt_token>
```

To obtain a token, use the `login` mutation described below.

## Schema

### Types

#### User

Represents a user in the UC-Hub system.

```graphql
type User {
  id: ID!
  name: String!
  email: String!
  avatar: String
  status: UserStatus!
  lastSeen: DateTime
  preferredLanguage: String!
  autoTranslate: Boolean!
  platformConnections: [PlatformConnection!]!
  createdAt: DateTime!
  updatedAt: DateTime!
}

enum UserStatus {
  ONLINE
  OFFLINE
  AWAY
  BUSY
  INVISIBLE
}

type PlatformConnection {
  platform: Platform!
  platformUserId: String!
  platformUsername: String
  isConnected: Boolean!
  tokenExpiresAt: DateTime
}

enum Platform {
  TEAMS
  WHATSAPP
  ZOOM
  GOOGLE_MEET
  SMS
}
```

#### Message

Represents a message sent through any of the integrated platforms.

```graphql
type Message {
  id: ID!
  sender: User!
  content: String!
  originalLanguage: String!
  translations: [MessageTranslation!]!
  timestamp: DateTime!
  platform: Platform!
  channel: Channel
  attachments: [Attachment!]!
  mentions: [User!]!
  reactions: [Reaction!]!
  thread: Thread
  isEdited: Boolean!
  editTimestamp: DateTime
  platformMessageId: String
  createdAt: DateTime!
  updatedAt: DateTime!
}

type MessageTranslation {
  language: String!
  content: String!
}

type Attachment {
  id: ID!
  type: AttachmentType!
  url: String!
  name: String
  size: Int
  mimeType: String
}

enum AttachmentType {
  IMAGE
  VIDEO
  AUDIO
  DOCUMENT
  LINK
}

type Reaction {
  user: User!
  emoji: String!
  timestamp: DateTime!
}

type Thread {
  id: ID!
  messages: [Message!]!
  participantCount: Int!
}
```

#### Channel

Represents a communication channel across platforms.

```graphql
type Channel {
  id: ID!
  name: String!
  description: String
  platform: Platform!
  platformChannelId: String!
  isPrivate: Boolean!
  members: [User!]!
  messages(limit: Int, offset: Int): [Message!]!
  unreadCount: Int!
  lastActivity: DateTime
  createdAt: DateTime!
  updatedAt: DateTime!
}
```

#### Meeting

Represents a meeting across platforms.

```graphql
type Meeting {
  id: ID!
  title: String!
  description: String
  startTime: DateTime!
  endTime: DateTime
  organizer: User!
  platform: Platform!
  platformMeetingId: String
  joinUrl: String
  status: MeetingStatus!
  participants: [MeetingParticipant!]!
  settings: MeetingSettings!
  recordings: [MeetingRecording!]!
  transcripts: [MeetingTranscript!]!
  summaries: [MeetingSummary!]!
  chatMessages: [MeetingChatMessage!]!
  createdAt: DateTime!
  updatedAt: DateTime!
}

enum MeetingStatus {
  SCHEDULED
  LIVE
  ENDED
  CANCELLED
}

type MeetingParticipant {
  user: User!
  role: ParticipantRole!
  status: ParticipantStatus!
  joinTime: DateTime
  leaveTime: DateTime
}

enum ParticipantRole {
  ORGANIZER
  PRESENTER
  ATTENDEE
}

enum ParticipantStatus {
  PENDING
  ACCEPTED
  DECLINED
  JOINED
  LEFT
}

type MeetingSettings {
  autoRecord: Boolean!
  muteParticipantsOnEntry: Boolean!
  enableWaitingRoom: Boolean!
  enableChat: Boolean!
  enableScreenSharing: Boolean!
  preferredLanguage: String!
  autoTranslate: Boolean!
}

type MeetingRecording {
  id: ID!
  url: String!
  duration: Int
  size: Int
  format: String
  createdAt: DateTime!
}

type MeetingTranscript {
  id: ID!
  language: String!
  content: String!
  createdAt: DateTime!
}

type MeetingSummary {
  id: ID!
  language: String!
  summary: String!
  actionItems: [String!]!
  keyPoints: [String!]!
  createdAt: DateTime!
}

type MeetingChatMessage {
  id: ID!
  sender: User!
  content: String!
  timestamp: DateTime!
  isPrivate: Boolean!
  recipient: User
}
```

#### VoiceProfile

Represents a voice profile for AI voice cloning.

```graphql
type VoiceProfile {
  id: ID!
  user: User!
  name: String!
  description: String
  language: String!
  gender: String
  sampleCount: Int!
  createdAt: DateTime!
  updatedAt: DateTime!
}
```

### Queries

```graphql
type Query {
  # User queries
  me: User!
  user(id: ID!): User
  users(limit: Int, offset: Int, filter: String): [User!]!
  
  # Message queries
  message(id: ID!): Message
  messages(
    channelId: ID,
    limit: Int,
    offset: Int,
    platform: Platform
  ): [Message!]!
  
  # Channel queries
  channel(id: ID!): Channel
  channels(
    platform: Platform,
    limit: Int,
    offset: Int,
    includePrivate: Boolean
  ): [Channel!]!
  
  # Meeting queries
  meeting(id: ID!): Meeting
  meetings(
    status: MeetingStatus,
    platform: Platform,
    startFrom: DateTime,
    startTo: DateTime,
    limit: Int,
    offset: Int
  ): [Meeting!]!
  
  # Voice profile queries
  voiceProfile(id: ID!): VoiceProfile
  voiceProfiles: [VoiceProfile!]!
  
  # Translation queries
  translateText(
    text: String!,
    sourceLanguage: String,
    targetLanguage: String!
  ): TranslationResult!
  
  # Platform queries
  platformStatus(platform: Platform!): PlatformStatus!
}

type TranslationResult {
  translatedText: String!
  detectedSourceLanguage: String
}

type PlatformStatus {
  platform: Platform!
  isConnected: Boolean!
  lastSyncTime: DateTime
  unreadMessageCount: Int!
  upcomingMeetingCount: Int!
}
```

### Mutations

```graphql
type Mutation {
  # Authentication mutations
  login(email: String!, password: String!): AuthPayload!
  logout: Boolean!
  refreshToken(refreshToken: String!): AuthPayload!
  
  # User mutations
  updateUserStatus(status: UserStatus!): User!
  updateUserPreferences(
    preferredLanguage: String,
    autoTranslate: Boolean
  ): User!
  
  # Message mutations
  sendMessage(
    channelId: ID!,
    content: String!,
    attachments: [AttachmentInput],
    mentions: [ID],
    threadId: ID
  ): Message!
  editMessage(
    messageId: ID!,
    content: String!
  ): Message!
  deleteMessage(messageId: ID!): Boolean!
  reactToMessage(
    messageId: ID!,
    emoji: String!
  ): Reaction!
  
  # Channel mutations
  createChannel(
    name: String!,
    description: String,
    platform: Platform!,
    isPrivate: Boolean,
    memberIds: [ID!]
  ): Channel!
  updateChannel(
    channelId: ID!,
    name: String,
    description: String
  ): Channel!
  addChannelMembers(
    channelId: ID!,
    memberIds: [ID!]!
  ): Channel!
  removeChannelMembers(
    channelId: ID!,
    memberIds: [ID!]!
  ): Channel!
  
  # Meeting mutations
  createMeeting(
    title: String!,
    description: String,
    startTime: DateTime!,
    endTime: DateTime,
    platform: Platform!,
    participantIds: [ID!]!,
    settings: MeetingSettingsInput
  ): Meeting!
  updateMeeting(
    meetingId: ID!,
    title: String,
    description: String,
    startTime: DateTime,
    endTime: DateTime
  ): Meeting!
  cancelMeeting(meetingId: ID!): Meeting!
  joinMeeting(meetingId: ID!): MeetingJoinResult!
  leaveMeeting(meetingId: ID!): Boolean!
  updateMeetingSettings(
    meetingId: ID!,
    settings: MeetingSettingsInput!
  ): MeetingSettings!
  
  # Voice profile mutations
  createVoiceProfile(
    name: String!,
    description: String,
    language: String!,
    gender: String,
    audioSamples: [Upload!]!
  ): VoiceProfile!
  deleteVoiceProfile(id: ID!): Boolean!
  generateSpeech(
    text: String!,
    voiceProfileId: ID!,
    targetLanguage: String
  ): SpeechResult!
  
  # Platform mutations
  connectPlatform(
    platform: Platform!,
    authCode: String!
  ): PlatformConnection!
  disconnectPlatform(platform: Platform!): Boolean!
}

input AttachmentInput {
  type: AttachmentType!
  file: Upload
  url: String
  name: String
  mimeType: String
}

input MeetingSettingsInput {
  autoRecord: Boolean
  muteParticipantsOnEntry: Boolean
  enableWaitingRoom: Boolean
  enableChat: Boolean
  enableScreenSharing: Boolean
  preferredLanguage: String
  autoTranslate: Boolean
}

type AuthPayload {
  token: String!
  refreshToken: String!
  user: User!
  expiresIn: Int!
}

type MeetingJoinResult {
  meeting: Meeting!
  joinUrl: String!
  webRtcToken: String
}

type SpeechResult {
  audioUrl: String!
  duration: Int!
  format: String!
}
```

### Subscriptions

```graphql
type Subscription {
  # Message subscriptions
  messageReceived(
    channelIds: [ID!],
    platforms: [Platform!]
  ): Message!
  messageUpdated(
    channelIds: [ID!],
    platforms: [Platform!]
  ): Message!
  messageDeleted(
    channelIds: [ID!],
    platforms: [Platform!]
  ): MessageDeletedPayload!
  
  # User subscriptions
  userStatusChanged: UserStatusPayload!
  
  # Meeting subscriptions
  meetingUpdated(meetingIds: [ID!]): Meeting!
  meetingParticipantJoined(meetingIds: [ID!]): MeetingParticipantPayload!
  meetingParticipantLeft(meetingIds: [ID!]): MeetingParticipantPayload!
  meetingChatMessageReceived(meetingIds: [ID!]): MeetingChatMessage!
  
  # Platform subscriptions
  platformConnectionChanged: PlatformConnectionPayload!
}

type MessageDeletedPayload {
  messageId: ID!
  channelId: ID!
  platform: Platform!
  timestamp: DateTime!
}

type UserStatusPayload {
  userId: ID!
  status: UserStatus!
  lastSeen: DateTime!
}

type MeetingParticipantPayload {
  meetingId: ID!
  participant: MeetingParticipant!
  timestamp: DateTime!
}

type PlatformConnectionPayload {
  userId: ID!
  platform: Platform!
  isConnected: Boolean!
  timestamp: DateTime!
}
```

## Example Queries

### Get Current User

```graphql
query {
  me {
    id
    name
    email
    status
    preferredLanguage
    platformConnections {
      platform
      isConnected
    }
  }
}
```

### Get Messages from a Channel

```graphql
query {
  messages(channelId: "channel-123", limit: 20, offset: 0) {
    id
    content
    timestamp
    sender {
      id
      name
      avatar
    }
    attachments {
      type
      url
      name
    }
    reactions {
      emoji
      user {
        id
        name
      }
    }
  }
}
```

### Create a Meeting

```graphql
mutation {
  createMeeting(
    title: "Weekly Team Sync",
    description: "Discuss project progress and blockers",
    startTime: "2023-06-15T14:00:00Z",
    endTime: "2023-06-15T15:00:00Z",
    platform: ZOOM,
    participantIds: ["user-123", "user-456"],
    settings: {
      autoRecord: true,
      muteParticipantsOnEntry: true,
      preferredLanguage: "en",
      autoTranslate: true
    }
  ) {
    id
    title
    joinUrl
    participants {
      user {
        id
        name
      }
      status
    }
  }
}
```

### Subscribe to New Messages

```graphql
subscription {
  messageReceived(
    channelIds: ["channel-123", "channel-456"],
    platforms: [TEAMS, WHATSAPP]
  ) {
    id
    content
    timestamp
    sender {
      id
      name
    }
    platform
  }
}
```

## Error Handling

GraphQL errors are returned in the `errors` array of the response. Each error includes:

- `message`: A human-readable error message
- `locations`: The line and column in the GraphQL query where the error occurred
- `path`: The path to the field that caused the error
- `extensions`: Additional information about the error, including:
  - `code`: A machine-readable error code
  - `statusCode`: The HTTP status code

Example error response:

```json
{
  "errors": [
    {
      "message": "User not authenticated",
      "locations": [
        {
          "line": 2,
          "column": 3
        }
      ],
      "path": [
        "me"
      ],
      "extensions": {
        "code": "UNAUTHENTICATED",
        "statusCode": 401
      }
    }
  ],
  "data": null
}
```

## Rate Limiting

The API enforces rate limits to prevent abuse. Rate limit information is included in the response headers:

- `X-RateLimit-Limit`: The maximum number of requests allowed in a time window
- `X-RateLimit-Remaining`: The number of requests remaining in the current time window
- `X-RateLimit-Reset`: The time when the current rate limit window resets (Unix timestamp)

If you exceed the rate limit, you'll receive a `429 Too Many Requests` status code.
