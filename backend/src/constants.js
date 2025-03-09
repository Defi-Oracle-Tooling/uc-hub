// Event types for real-time updates
const EVENTS = {
  // Message events
  MESSAGE_CREATED: 'MESSAGE_CREATED',
  MESSAGE_UPDATED: 'MESSAGE_UPDATED',
  MESSAGE_DELETED: 'MESSAGE_DELETED',
  
  // User events
  USER_PRESENCE: 'USER_PRESENCE',
  USER_TYPING: 'USER_TYPING',
  USER_STATUS_CHANGED: 'USER_STATUS_CHANGED',
  
  // Meeting events
  MEETING_CREATED: 'MEETING_CREATED',
  MEETING_UPDATED: 'MEETING_UPDATED',
  MEETING_DELETED: 'MEETING_DELETED',
  MEETING_STARTED: 'MEETING_STARTED',
  MEETING_ENDED: 'MEETING_ENDED',
  MEETING_PARTICIPANT_JOINED: 'MEETING_PARTICIPANT_JOINED',
  MEETING_PARTICIPANT_LEFT: 'MEETING_PARTICIPANT_LEFT',
  
  // Platform-specific events
  TEAMS_CHAT_CREATED: 'TEAMS_CHAT_CREATED',
  TEAMS_CHAT_UPDATED: 'TEAMS_CHAT_UPDATED',
  TEAMS_MEMBER_ADDED: 'TEAMS_MEMBER_ADDED',
  TEAMS_MEMBER_REMOVED: 'TEAMS_MEMBER_REMOVED'
};

// Message status types
const MESSAGE_STATUS = {
  SENDING: 'sending',
  SENT: 'sent',
  DELIVERED: 'delivered',
  READ: 'read',
  FAILED: 'failed'
};

// User presence status types
const PRESENCE_STATUS = {
  ONLINE: 'online',
  OFFLINE: 'offline',
  AWAY: 'away',
  DND: 'dnd',
  INVISIBLE: 'invisible'
};

// Meeting status types
const MEETING_STATUS = {
  SCHEDULED: 'scheduled',
  IN_PROGRESS: 'in-progress',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled'
};

// Platform types
const PLATFORMS = {
  INTERNAL: 'internal',
  TEAMS: 'teams',
  WHATSAPP: 'whatsapp',
  ZOOM: 'zoom',
  GOOGLE_MEET: 'google-meet',
  SMS: 'sms'
};

// User roles
const USER_ROLES = {
  ADMIN: 'admin',
  USER: 'user',
  GUEST: 'guest'
};

// Conversation participant roles
const PARTICIPANT_ROLES = {
  ORGANIZER: 'organizer',
  ATTENDEE: 'attendee'
};

// Error types for consistent error handling
const ERROR_TYPES = {
  AUTHENTICATION: 'AUTHENTICATION_ERROR',
  AUTHORIZATION: 'AUTHORIZATION_ERROR',
  NOT_FOUND: 'NOT_FOUND_ERROR',
  BAD_INPUT: 'BAD_INPUT_ERROR',
  RATE_LIMIT: 'RATE_LIMIT_ERROR',
  INTERNAL: 'INTERNAL_SERVER_ERROR'
};

// Cache keys and prefixes
const CACHE_KEYS = {
  USER_PRESENCE: 'presence:user:',
  CONVERSATION_MEMBERS: 'conv:members:',
  USER_SESSIONS: 'sessions:user:',
  RATE_LIMIT: 'ratelimit:'
};

// API rate limits
const RATE_LIMITS = {
  MESSAGE_SEND: {
    WINDOW_MS: 60000, // 1 minute
    MAX_REQUESTS: 60
  },
  API_CALLS: {
    WINDOW_MS: 60000,
    MAX_REQUESTS: 100
  }
};

module.exports = {
  EVENTS,
  MESSAGE_STATUS,
  PRESENCE_STATUS,
  MEETING_STATUS,
  PLATFORMS,
  USER_ROLES,
  PARTICIPANT_ROLES,
  ERROR_TYPES,
  CACHE_KEYS,
  RATE_LIMITS
};