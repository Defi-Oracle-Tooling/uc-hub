const mongoose = require('mongoose');

const MessageSchema = new mongoose.Schema({
  content: {
    type: String,
    required: [true, 'Message content is required'],
    trim: true,
    maxlength: [5000, 'Message cannot be more than 5000 characters']
  },
  sender: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'Sender is required']
  },
  recipients: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  conversation: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Conversation'
  },
  platform: {
    type: String,
    enum: ['Teams', 'Zoom', 'WhatsApp', 'GoogleMeet', 'SMS', 'internal'],
    required: [true, 'Platform is required']
  },
  externalId: {
    type: String,
    sparse: true // Only index if field exists
  },
  attachments: [{
    type: {
      type: String,
      enum: ['image', 'video', 'document', 'audio', 'other'],
    },
    url: String,
    filename: String,
    size: Number,
    mimeType: String
  }],
  metadata: {
    translated: {
      type: Boolean,
      default: false
    },
    originalLanguage: String,
    translatedTo: String,
    translatedContent: String,
    readBy: [{
      user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      },
      timestamp: {
        type: Date,
        default: Date.now
      }
    }]
  },
  isEncrypted: {
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
  },
  deletedAt: {
    type: Date
  }
}, {
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Virtual for checking if message is edited
MessageSchema.virtual('isEdited').get(function() {
  return this.createdAt.getTime() !== this.updatedAt.getTime();
});

// Index for faster querying
MessageSchema.index({ sender: 1, createdAt: -1 });
MessageSchema.index({ conversation: 1, createdAt: 1 });
MessageSchema.index({ platform: 1 });

// Update timestamp when document is updated
MessageSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

// Soft delete functionality
MessageSchema.methods.softDelete = function() {
  this.deletedAt = Date.now();
  return this.save();
};

// Check if message is deleted
MessageSchema.methods.isDeleted = function() {
  return !!this.deletedAt;
};

module.exports = mongoose.model('Message', MessageSchema);