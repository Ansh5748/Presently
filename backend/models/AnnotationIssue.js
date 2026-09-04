const mongoose = require('mongoose');

const annotationIssueSchema = new mongoose.Schema({
  id: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  pinId: {
    type: String,
    required: true,
    index: true
  },
  projectId: {
    type: String,
    required: true,
    index: true
  },
  assigneeId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    index: true
  },
  status: {
    type: String,
    enum: ['active', 'in_progress', 'in_review', 'resolved'],
    default: 'active'
  },
  labels: [{
    type: String
  }],
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  assignmentHistory: [{
    fromUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    toUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    status: {
      type: String,
      enum: ['active', 'in_progress', 'in_review', 'resolved'],
      required: true
    },
    at: {
      type: Date,
      default: Date.now
    }
  }],
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

annotationIssueSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  next();
});

annotationIssueSchema.index({
  projectId: 1,
  createdAt: -1
});

module.exports = mongoose.model('AnnotationIssue', annotationIssueSchema);
