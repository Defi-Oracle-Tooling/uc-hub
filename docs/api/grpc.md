# UC-Hub gRPC API Documentation

## Overview

The UC-Hub gRPC API provides high-performance, low-latency services for backend-to-backend communication. This API is optimized for microservices architecture and real-time data processing, offering strongly typed contracts and efficient binary serialization.

## Base URL

```
grpc://api.uc-hub.example.com:50051
```

## Authentication

All gRPC requests must include a valid JWT token in the metadata:

```
authorization: Bearer <your_jwt_token>
```

To obtain a token, use the authentication service described below.

## Protocol Buffers Definition

The complete Protocol Buffers definition can be found in `/backend/src/proto/communication.proto`. Below is a summary of the main services and message types.

### Services

#### UserService

Service for managing users and user-related operations.

```protobuf
service UserService {
  rpc GetUser(GetUserRequest) returns (User);
  rpc ListUsers(ListUsersRequest) returns (ListUsersResponse);
  rpc UpdateUserStatus(UpdateUserStatusRequest) returns (User);
  rpc UpdateUserPreferences(UpdateUserPreferencesRequest) returns (User);
  rpc GetUserPlatformConnections(GetUserPlatformConnectionsRequest) returns (GetUserPlatformConnectionsResponse);
}
```

#### MessageService

Service for sending, receiving, and managing messages across platforms.

```protobuf
service MessageService {
  rpc SendMessage(SendMessageRequest) returns (Message);
  rpc GetMessage(GetMessageRequest) returns (Message);
  rpc GetMessages(GetMessagesRequest) returns (GetMessagesResponse);
  rpc StreamMessages(StreamMessagesRequest) returns (stream Message);
  rpc EditMessage(EditMessageRequest) returns (Message);
  rpc DeleteMessage(DeleteMessageRequest) returns (DeleteMessageResponse);
  rpc ReactToMessage(ReactToMessageRequest) returns (Reaction);
}
```

#### MeetingService

Service for creating, joining, and managing meetings across platforms.

```protobuf
service MeetingService {
  rpc CreateMeeting(CreateMeetingRequest) returns (Meeting);
  rpc GetMeeting(GetMeetingRequest) returns (Meeting);
  rpc ListMeetings(ListMeetingsRequest) returns (ListMeetingsResponse);
  rpc UpdateMeeting(UpdateMeetingRequest) returns (Meeting);
  rpc CancelMeeting(CancelMeetingRequest) returns (Meeting);
  rpc JoinMeeting(JoinMeetingRequest) returns (JoinMeetingResponse);
  rpc LeaveMeeting(LeaveMeetingRequest) returns (LeaveMeetingResponse);
  rpc StreamMeetingEvents(StreamMeetingEventsRequest) returns (stream MeetingEvent);
}
```

#### TranslationService

Service for real-time text and message translation.

```protobuf
service TranslationService {
  rpc TranslateText(TranslateTextRequest) returns (TranslateTextResponse);
  rpc TranslateMessage(TranslateMessageRequest) returns (Message);
  rpc DetectLanguage(DetectLanguageRequest) returns (DetectLanguageResponse);
}
```

#### PlatformService

Service for managing connections to external communication platforms.

```protobuf
service PlatformService {
  rpc ConnectPlatform(ConnectPlatformRequest) returns (PlatformConnection);
  rpc DisconnectPlatform(DisconnectPlatformRequest) returns (DisconnectPlatformResponse);
  rpc GetPlatformStatus(GetPlatformStatusRequest) returns (PlatformStatus);
  rpc SyncPlatformData(SyncPlatformDataRequest) returns (SyncPlatformDataResponse);
  rpc GetUnreadMessageCount(GetUnreadMessageCountRequest) returns (GetUnreadMessageCountResponse);
}
```

#### VoiceService

Service for voice cloning and speech synthesis.

```protobuf
service VoiceService {
  rpc CreateVoiceProfile(CreateVoiceProfileRequest) returns (VoiceProfile);
  rpc GetVoiceProfile(GetVoiceProfileRequest) returns (VoiceProfile);
  rpc ListVoiceProfiles(ListVoiceProfilesRequest) returns (ListVoiceProfilesResponse);
  rpc DeleteVoiceProfile(DeleteVoiceProfileRequest) returns (DeleteVoiceProfileResponse);
  rpc GenerateSpeech(GenerateSpeechRequest) returns (GenerateSpeechResponse);
  rpc StreamSpeechGeneration(stream AudioChunk) returns (stream AudioChunk);
}
```

#### SpeechToTextService

Service for transcribing audio to text.

```protobuf
service SpeechToTextService {
  rpc Transcribe(TranscribeRequest) returns (TranscribeResponse);
  rpc StreamTranscribe(stream AudioChunk) returns (stream TranscribeResponse);
  rpc DetectLanguageFromAudio(DetectLanguageFromAudioRequest) returns (DetectLanguageResponse);
}
```

#### MeetingSummaryService

Service for generating meeting summaries and extracting action items.

```protobuf
service MeetingSummaryService {
  rpc GenerateSummary(GenerateSummaryRequest) returns (MeetingSummary);
  rpc TranslateSummary(TranslateSummaryRequest) returns (MeetingSummary);
  rpc ExtractActionItems(ExtractActionItemsRequest) returns (ExtractActionItemsResponse);
}
```

#### AuthService

Service for authentication and token management.

```protobuf
service AuthService {
  rpc Login(LoginRequest) returns (AuthResponse);
  rpc Logout(LogoutRequest) returns (LogoutResponse);
  rpc RefreshToken(RefreshTokenRequest) returns (AuthResponse);
  rpc ValidateToken(ValidateTokenRequest) returns (ValidateTokenResponse);
}
```

### Message Types

#### User

```protobuf
message User {
  string id = 1;
  string name = 2;
  string email = 3;
  string avatar = 4;
  UserStatus status = 5;
  google.protobuf.Timestamp last_seen = 6;
  string preferred_language = 7;
  bool auto_translate = 8;
  repeated PlatformConnection platform_connections = 9;
  google.protobuf.Timestamp created_at = 10;
  google.protobuf.Timestamp updated_at = 11;
}

enum UserStatus {
  USER_STATUS_UNSPECIFIED = 0;
  USER_STATUS_ONLINE = 1;
  USER_STATUS_OFFLINE = 2;
  USER_STATUS_AWAY = 3;
  USER_STATUS_BUSY = 4;
  USER_STATUS_INVISIBLE = 5;
}
```

#### Message

```protobuf
message Message {
  string id = 1;
  string sender_id = 2;
  string content = 3;
  string original_language = 4;
  map<string, string> translations = 5;
  google.protobuf.Timestamp timestamp = 6;
  Platform platform = 7;
  string channel_id = 8;
  repeated Attachment attachments = 9;
  repeated string mentioned_user_ids = 10;
  repeated Reaction reactions = 11;
  string thread_id = 12;
  bool is_edited = 13;
  google.protobuf.Timestamp edit_timestamp = 14;
  string platform_message_id = 15;
  google.protobuf.Timestamp created_at = 16;
  google.protobuf.Timestamp updated_at = 17;
}

message Attachment {
  string id = 1;
  AttachmentType type = 2;
  string url = 3;
  string name = 4;
  int64 size = 5;
  string mime_type = 6;
}

enum AttachmentType {
  ATTACHMENT_TYPE_UNSPECIFIED = 0;
  ATTACHMENT_TYPE_IMAGE = 1;
  ATTACHMENT_TYPE_VIDEO = 2;
  ATTACHMENT_TYPE_AUDIO = 3;
  ATTACHMENT_TYPE_DOCUMENT = 4;
  ATTACHMENT_TYPE_LINK = 5;
}

message Reaction {
  string user_id = 1;
  string emoji = 2;
  google.protobuf.Timestamp timestamp = 3;
}
```

#### Meeting

```protobuf
message Meeting {
  string id = 1;
  string title = 2;
  string description = 3;
  google.protobuf.Timestamp start_time = 4;
  google.protobuf.Timestamp end_time = 5;
  string organizer_id = 6;
  Platform platform = 7;
  string platform_meeting_id = 8;
  string join_url = 9;
  MeetingStatus status = 10;
  repeated MeetingParticipant participants = 11;
  MeetingSettings settings = 12;
  repeated MeetingRecording recordings = 13;
  repeated MeetingTranscript transcripts = 14;
  repeated MeetingSummary summaries = 15;
  google.protobuf.Timestamp created_at = 16;
  google.protobuf.Timestamp updated_at = 17;
}

enum MeetingStatus {
  MEETING_STATUS_UNSPECIFIED = 0;
  MEETING_STATUS_SCHEDULED = 1;
  MEETING_STATUS_LIVE = 2;
  MEETING_STATUS_ENDED = 3;
  MEETING_STATUS_CANCELLED = 4;
}

message MeetingParticipant {
  string user_id = 1;
  ParticipantRole role = 2;
  ParticipantStatus status = 3;
  google.protobuf.Timestamp join_time = 4;
  google.protobuf.Timestamp leave_time = 5;
}

enum ParticipantRole {
  PARTICIPANT_ROLE_UNSPECIFIED = 0;
  PARTICIPANT_ROLE_ORGANIZER = 1;
  PARTICIPANT_ROLE_PRESENTER = 2;
  PARTICIPANT_ROLE_ATTENDEE = 3;
}

enum ParticipantStatus {
  PARTICIPANT_STATUS_UNSPECIFIED = 0;
  PARTICIPANT_STATUS_PENDING = 1;
  PARTICIPANT_STATUS_ACCEPTED = 2;
  PARTICIPANT_STATUS_DECLINED = 3;
  PARTICIPANT_STATUS_JOINED = 4;
  PARTICIPANT_STATUS_LEFT = 5;
}

message MeetingSettings {
  bool auto_record = 1;
  bool mute_participants_on_entry = 2;
  bool enable_waiting_room = 3;
  bool enable_chat = 4;
  bool enable_screen_sharing = 5;
  string preferred_language = 6;
  bool auto_translate = 7;
}
```

#### VoiceProfile

```protobuf
message VoiceProfile {
  string id = 1;
  string user_id = 2;
  string name = 3;
  string description = 4;
  string language = 5;
  string gender = 6;
  int32 sample_count = 7;
  google.protobuf.Timestamp created_at = 8;
  google.protobuf.Timestamp updated_at = 9;
}
```

#### Platform

```protobuf
enum Platform {
  PLATFORM_UNSPECIFIED = 0;
  PLATFORM_TEAMS = 1;
  PLATFORM_WHATSAPP = 2;
  PLATFORM_ZOOM = 3;
  PLATFORM_GOOGLE_MEET = 4;
  PLATFORM_SMS = 5;
}

message PlatformConnection {
  Platform platform = 1;
  string platform_user_id = 2;
  string platform_username = 3;
  bool is_connected = 4;
  google.protobuf.Timestamp token_expires_at = 5;
}

message PlatformStatus {
  Platform platform = 1;
  bool is_connected = 2;
  google.protobuf.Timestamp last_sync_time = 3;
  int32 unread_message_count = 4;
  int32 upcoming_meeting_count = 5;
}
```

## Request and Response Examples

### User Service

#### GetUser

Request:
```protobuf
{
  "id": "user-123"
}
```

Response:
```protobuf
{
  "id": "user-123",
  "name": "John Doe",
  "email": "john.doe@example.com",
  "avatar": "https://example.com/avatars/john.jpg",
  "status": "USER_STATUS_ONLINE",
  "last_seen": "2023-06-15T10:30:00Z",
  "preferred_language": "en",
  "auto_translate": true,
  "platform_connections": [
    {
      "platform": "PLATFORM_TEAMS",
      "platform_user_id": "teams-user-123",
      "platform_username": "john.doe@company.com",
      "is_connected": true,
      "token_expires_at": "2023-06-16T10:30:00Z"
    },
    {
      "platform": "PLATFORM_WHATSAPP",
      "platform_user_id": "whatsapp-user-456",
      "platform_username": "+1234567890",
      "is_connected": true,
      "token_expires_at": "2023-06-16T10:30:00Z"
    }
  ],
  "created_at": "2023-01-01T00:00:00Z",
  "updated_at": "2023-06-15T10:30:00Z"
}
```

#### UpdateUserStatus

Request:
```protobuf
{
  "user_id": "user-123",
  "status": "USER_STATUS_BUSY"
}
```

Response:
```protobuf
{
  "id": "user-123",
  "name": "John Doe",
  "email": "john.doe@example.com",
  "avatar": "https://example.com/avatars/john.jpg",
  "status": "USER_STATUS_BUSY",
  "last_seen": "2023-06-15T10:35:00Z",
  "preferred_language": "en",
  "auto_translate": true,
  "platform_connections": [
    {
      "platform": "PLATFORM_TEAMS",
      "platform_user_id": "teams-user-123",
      "platform_username": "john.doe@company.com",
      "is_connected": true,
      "token_expires_at": "2023-06-16T10:30:00Z"
    },
    {
      "platform": "PLATFORM_WHATSAPP",
      "platform_user_id": "whatsapp-user-456",
      "platform_username": "+1234567890",
      "is_connected": true,
      "token_expires_at": "2023-06-16T10:30:00Z"
    }
  ],
  "created_at": "2023-01-01T00:00:00Z",
  "updated_at": "2023-06-15T10:35:00Z"
}
```

### Message Service

#### SendMessage

Request:
```protobuf
{
  "channel_id": "channel-123",
  "content": "Hello, world!",
  "attachments": [
    {
      "type": "ATTACHMENT_TYPE_IMAGE",
      "url": "https://example.com/images/hello.jpg",
      "name": "hello.jpg",
      "size": 1024000,
      "mime_type": "image/jpeg"
    }
  ],
  "mentioned_user_ids": ["user-456"],
  "thread_id": "thread-789"
}
```

Response:
```protobuf
{
  "id": "message-123",
  "sender_id": "user-123",
  "content": "Hello, world!",
  "original_language": "en",
  "translations": {},
  "timestamp": "2023-06-15T10:40:00Z",
  "platform": "PLATFORM_TEAMS",
  "channel_id": "channel-123",
  "attachments": [
    {
      "id": "attachment-123",
      "type": "ATTACHMENT_TYPE_IMAGE",
      "url": "https://example.com/images/hello.jpg",
      "name": "hello.jpg",
      "size": 1024000,
      "mime_type": "image/jpeg"
    }
  ],
  "mentioned_user_ids": ["user-456"],
  "reactions": [],
  "thread_id": "thread-789",
  "is_edited": false,
  "platform_message_id": "teams-message-123",
  "created_at": "2023-06-15T10:40:00Z",
  "updated_at": "2023-06-15T10:40:00Z"
}
```

#### StreamMessages

Request:
```protobuf
{
  "channel_ids": ["channel-123", "channel-456"],
  "platforms": ["PLATFORM_TEAMS", "PLATFORM_WHATSAPP"],
  "include_history": true,
  "history_limit": 50
}
```

Response Stream:
```protobuf
{
  "id": "message-123",
  "sender_id": "user-123",
  "content": "Hello, world!",
  "original_language": "en",
  "translations": {},
  "timestamp": "2023-06-15T10:40:00Z",
  "platform": "PLATFORM_TEAMS",
  "channel_id": "channel-123",
  "attachments": [],
  "mentioned_user_ids": [],
  "reactions": [],
  "is_edited": false,
  "created_at": "2023-06-15T10:40:00Z",
  "updated_at": "2023-06-15T10:40:00Z"
}
```

### Translation Service

#### TranslateText

Request:
```protobuf
{
  "text": "Hello, how are you?",
  "source_language": "en",
  "target_language": "es"
}
```

Response:
```protobuf
{
  "translated_text": "Hola, ¿cómo estás?",
  "detected_source_language": "en"
}
```

#### DetectLanguage

Request:
```protobuf
{
  "text": "Bonjour, comment ça va?"
}
```

Response:
```protobuf
{
  "language": "fr",
  "confidence": 0.98
}
```

### Meeting Service

#### CreateMeeting

Request:
```protobuf
{
  "title": "Weekly Team Sync",
  "description": "Discuss project progress and blockers",
  "start_time": "2023-06-16T14:00:00Z",
  "end_time": "2023-06-16T15:00:00Z",
  "platform": "PLATFORM_ZOOM",
  "participant_ids": ["user-123", "user-456", "user-789"],
  "settings": {
    "auto_record": true,
    "mute_participants_on_entry": true,
    "enable_waiting_room": false,
    "enable_chat": true,
    "enable_screen_sharing": true,
    "preferred_language": "en",
    "auto_translate": true
  }
}
```

Response:
```protobuf
{
  "id": "meeting-123",
  "title": "Weekly Team Sync",
  "description": "Discuss project progress and blockers",
  "start_time": "2023-06-16T14:00:00Z",
  "end_time": "2023-06-16T15:00:00Z",
  "organizer_id": "user-123",
  "platform": "PLATFORM_ZOOM",
  "platform_meeting_id": "zoom-meeting-123",
  "join_url": "https://zoom.us/j/123456789",
  "status": "MEETING_STATUS_SCHEDULED",
  "participants": [
    {
      "user_id": "user-123",
      "role": "PARTICIPANT_ROLE_ORGANIZER",
      "status": "PARTICIPANT_STATUS_ACCEPTED"
    },
    {
      "user_id": "user-456",
      "role": "PARTICIPANT_ROLE_ATTENDEE",
      "status": "PARTICIPANT_STATUS_PENDING"
    },
    {
      "user_id": "user-789",
      "role": "PARTICIPANT_ROLE_ATTENDEE",
      "status": "PARTICIPANT_STATUS_PENDING"
    }
  ],
  "settings": {
    "auto_record": true,
    "mute_participants_on_entry": true,
    "enable_waiting_room": false,
    "enable_chat": true,
    "enable_screen_sharing": true,
    "preferred_language": "en",
    "auto_translate": true
  },
  "created_at": "2023-06-15T10:45:00Z",
  "updated_at": "2023-06-15T10:45:00Z"
}
```

### Voice Service

#### CreateVoiceProfile

Request:
```protobuf
{
  "user_id": "user-123",
  "name": "My Professional Voice",
  "description": "Clear and professional voice for meetings",
  "language": "en",
  "gender": "neutral",
  "audio_samples": [
    {
      "data": "<binary audio data>",
      "format": "wav",
      "sample_rate": 16000
    },
    {
      "data": "<binary audio data>",
      "format": "wav",
      "sample_rate": 16000
    }
  ]
}
```

Response:
```protobuf
{
  "id": "voice-profile-123",
  "user_id": "user-123",
  "name": "My Professional Voice",
  "description": "Clear and professional voice for meetings",
  "language": "en",
  "gender": "neutral",
  "sample_count": 2,
  "created_at": "2023-06-15T10:50:00Z",
  "updated_at": "2023-06-15T10:50:00Z"
}
```

#### GenerateSpeech

Request:
```protobuf
{
  "text": "Hello, this is a test of the voice cloning system.",
  "voice_profile_id": "voice-profile-123",
  "options": {
    "speed": 1.0,
    "pitch": 0.0,
    "format": "mp3",
    "sample_rate": 22050
  }
}
```

Response:
```protobuf
{
  "audio_data": "<binary audio data>",
  "format": "mp3",
  "sample_rate": 22050,
  "duration_ms": 3500
}
```

## Error Handling

gRPC errors are returned with appropriate status codes and error messages. Common error codes include:

- `INVALID_ARGUMENT (3)`: The request contains invalid arguments
- `NOT_FOUND (5)`: The requested resource was not found
- `ALREADY_EXISTS (6)`: The resource already exists
- `PERMISSION_DENIED (7)`: The client does not have permission to perform the operation
- `UNAUTHENTICATED (16)`: The client is not authenticated
- `RESOURCE_EXHAUSTED (8)`: The client has exceeded rate limits
- `INTERNAL (13)`: An internal server error occurred

Example error response:

```
{
  "code": 5,
  "message": "User not found: user-123",
  "details": [
    {
      "@type": "type.googleapis.com/google.rpc.ErrorInfo",
      "reason": "USER_NOT_FOUND",
      "domain": "uc-hub.example.com",
      "metadata": {
        "user_id": "user-123"
      }
    }
  ]
}
```

## Client Libraries

The UC-Hub gRPC API can be accessed using client libraries generated from the Protocol Buffers definition. Client libraries are available for the following languages:

- Node.js
- Python
- Java
- Go
- C#
- Ruby

Example Node.js client usage:

```javascript
const grpc = require('@grpc/grpc-js');
const protoLoader = require('@grpc/proto-loader');
const path = require('path');

// Load proto file
const protoPath = path.join(__dirname, 'communication.proto');
const packageDefinition = protoLoader.loadSync(protoPath, {
  keepCase: true,
  longs: String,
  enums: String,
  defaults: true,
  oneofs: true
});

const protoDescriptor = grpc.loadPackageDefinition(packageDefinition);
const { UserService, MessageService } = protoDescriptor.uc_hub;

// Create client
const client = new UserService(
  'api.uc-hub.example.com:50051',
  grpc.credentials.createSsl()
);

// Add authentication metadata
const metadata = new grpc.Metadata();
metadata.add('authorization', 'Bearer YOUR_JWT_TOKEN');

// Make a request
client.getUser({ id: 'user-123' }, metadata, (err, response) => {
  if (err) {
    console.error('Error:', err);
    return;
  }
  console.log('User:', response);
});
```

## Rate Limiting

The gRPC API enforces rate limits to prevent abuse. Rate limit information is included in the response metadata:

- `x-ratelimit-limit`: The maximum number of requests allowed in a time window
- `x-ratelimit-remaining`: The number of requests remaining in the current time window
- `x-ratelimit-reset`: The time when the current rate limit window resets (Unix timestamp)

If you exceed the rate limit, you'll receive a `RESOURCE_EXHAUSTED (8)` status code.
