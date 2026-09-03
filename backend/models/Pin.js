const mongoose = require('mongoose');

const pinSchema = new mongoose.Schema({
  id: {
    type: String,
    required: true,
    unique: true
  },
  projectId: {
    type: String,
    required: true,
    index: true
  },
  pageId: {
    type: String,
    required: true
  },
  x: {
    type: Number,
    required: true
  },
  y: {
    type: Number,
    required: true
  },
  number: {
    type: Number,
    required: true
  },
  title: {
    type: String,
    required: true
  },
  description: String,
  device: String,
  type: {
    type: String,
    enum: ['issue', 'comment'],
    default: 'comment'
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

pinSchema.index({
  projectId: 1,
  number: 1
});

module.exports = mongoose.model('Pin', pinSchema);
