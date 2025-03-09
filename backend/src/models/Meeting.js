const mongoose = require('mongoose');

const MeetingSchema = new mongoose.Schema({
  title: {
    type: String,
    required: [true, 'Meeting title is required'],
    trim: true,
    maxlength: [200, 'Title cannot be more than 200 characters']
  },
  description: {
    type: String,
    trim: true,
    maxlength: [2000, 'Description cannot be more than 2000 characters']
  },
  organizer: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'Meeting organizer is required']
  },
  participants: [{
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    role: {
      type: String,
      enum: ['organizer', 'presenter', 'attendee'],
      default: 'attendee'
    },
    status: {
      type: String,
      enum: ['accepted', 'declined', 'tentative', 'pending'],
      default: 'pending'
    },
    joinedAt: Date,
    leftAt: Date
  }],
  startTime: {
    type: Date,
    required: [true, 'Meeting start time is required']
  },
  endTime: {
    type: Date,
    required: [true, 'Meeting end time is required']
  },
  timezone: {
    type: String,
    default: 'UTC'
  },
  platform: {
    type: String,
    enum: ['Teams', 'Zoom', 'WhatsApp', 'GoogleMeet', 'internal'],
    required: [true, 'Meeting platform is required']
  },
  externalId: {
    type: String,
    sparse: true
  },
  joinUrl: {
    type: String
  },
  recordingUrl: {
    type: String
  },
  isRecurring: {
    type: Boolean,
    default: false
  },
  recurringPattern: {
    frequency: {
      type: String,
      enum: ['daily', 'weekly', 'monthly', 'yearly']
    },
    interval: Number, // e.g., every 2 weeks
    daysOfWeek: [Number], // 0 = Sunday, 1 = Monday, etc.
    endDate: Date,
    occurrences: Number
  },
  status: {
    type: String,
    enum: ['scheduled', 'in-progress', 'completed', 'cancelled'],
    default: 'scheduled'
  },
  features: {
    isRecorded: {
      type: Boolean,
      default: false
    },
    isTranscribed: {
      type: Boolean,
      default: false
    },
    isTranslated: {
      type: Boolean,
      default: false
    },
    translationLanguages: [String]
  },
  summary: {
    type: String,
    trim: true
  },
  transcription: {
    type: String
  },
  tags: [String],
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  },
  cancelledAt: {
    type: Date
  }
}, {
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Virtual for duration in minutes
MeetingSchema.virtual('durationMinutes').get(function() {
  return Math.round((this.endTime - this.startTime) / (1000 * 60));
});

// Index for faster querying
MeetingSchema.index({ startTime: 1, status: 1 });
MeetingSchema.index({ organizer: 1 });
MeetingSchema.index({ platform: 1 });
MeetingSchema.index({ "participants.user": 1 });

// Update timestamp when document is updated
MeetingSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

// Cancel meeting
MeetingSchema.methods.cancel = function() {
  this.status = 'cancelled';
  this.cancelledAt = Date.now();
  return this.save();
};

// Check if meeting is upcoming
MeetingSchema.methods.isUpcoming = function() {
  return this.status === 'scheduled' && new Date() < this.startTime;
};

// Check if meeting is active
MeetingSchema.methods.isActive = function() {
  const now = new Date();
  return this.status === 'in-progress' || 
         (this.status === 'scheduled' && now >= this.startTime && now < this.endTime);
};

module.exports = mongoose.model('Meeting', MeetingSchema);