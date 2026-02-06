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
    required: true
  },
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
  pages: [projectPageSchema],
  status: {
    type: String,
    enum: ['DRAFT', 'PUBLISHED'],
    default: 'DRAFT'
  },
  // Store published snapshot separately
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

module.exports = mongoose.model('Project', projectSchema);
