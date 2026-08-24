const mongoose = require('mongoose');

const annotationMessageSchema = new mongoose.Schema({
  id: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  annotationIssueId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'AnnotationIssue',
    required: true,
    index: true
  },
  senderId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  content: {
    type: String,
    required: true,
    trim: true
  },
  visibility: {
    type: String,
    enum: ['all', 'team'],
    default: 'all'
  },
  createdAt: {
    type: Date,
    default: Date.now,
    index: true
  }
});

annotationMessageSchema.index({ annotationIssueId: 1, createdAt: 1 });

module.exports = mongoose.model('AnnotationMessage', annotationMessageSchema);
