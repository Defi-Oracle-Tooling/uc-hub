const mongoose = require('mongoose');

const ConversationSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true,
    trim: true
  },
  platform: {
    type: String,
    required: true,
    enum: ['internal', 'teams', 'whatsapp', 'zoom', 'google-meet', 'sms'],
    default: 'internal'
  },
  participants: [{
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    role: {
      type: String,
      enum: ['organizer', 'attendee'],
      default: 'attendee'
    },
    joinedAt: {
      type: Date,
      default: Date.now
    }
  }],
  lastMessage: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Message'
  },
  externalId: {
    type: String,
    sparse: true,
    description: 'ID of the conversation in the external platform'
  },
  metadata: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },
  isGroup: {
    type: Boolean,
    default: false
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Create indexes for faster queries
ConversationSchema.index({ 'participants.user': 1 });
ConversationSchema.index({ platform: 1 });
ConversationSchema.index({ externalId: 1, platform: 1 }, { unique: true, sparse: true });

// Virtual for getting the number of messages in the conversation (not stored in DB)
ConversationSchema.virtual('messageCount').get(function() {
  return this._messageCount || 0;
});

ConversationSchema.set('toJSON', { virtuals: true });
ConversationSchema.set('toObject', { virtuals: true });

module.exports = mongoose.model('Conversation', ConversationSchema);