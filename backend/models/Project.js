const mongoose = require('mongoose');

const projectPageSchema = new mongoose.Schema({
  id: {
    type: String,
    required: true
  },
  name: {
    type: String,
    required: true
  },
  imageUrl: {
    type: String,
    required: false
  },
  mobileImageUrl: String,
  originalUrl: String,
  details: String
}, { _id: false });

const pinSnapshotSchema = new mongoose.Schema({
  id: String,
  projectId: String,
  pageId: String,
  x: Number,
  y: Number,
  number: Number,
  title: String,
  description: String
}, { _id: false });

const projectSchema = new mongoose.Schema({
  id: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  name: {
    type: String,
    required: true
  },
  clientName: String,
  websiteUrl: {
    type: String,
    required: true
  },
  groupId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Group',
    index: true
  },
  groupIds: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Group',
    index: true
  }],
  mode: {
    type: String,
    enum: ['present', 'working'],
    default: 'present'
  },
  assignedUserIds: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    index: true
  }],
  pages: [projectPageSchema],
  status: {
    type: String,
    enum: ['DRAFT', 'PUBLISHED'],
    default: 'DRAFT'
  },
  publishedSnapshot: {
    pages: [projectPageSchema],
    pins: [pinSnapshotSchema],
    publishedAt: Date
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});
projectSchema.index({
  userId: 1,
  createdAt: -1
});

projectSchema.index({
  groupId: 1,
  createdAt: -1
});

projectSchema.index({
  groupIds: 1,
  createdAt: -1
});

projectSchema.index({
  assignedUserIds: 1,
  createdAt: -1
});

module.exports = mongoose.model('Project', projectSchema);
