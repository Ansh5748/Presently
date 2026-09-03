const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
  id: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  groupId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Group',
    index: true
  },
  subgroupId: {
    type: String,
    index: true
  },
  directRecipientId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
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

messageSchema.index({ groupId: 1, createdAt: 1 });
messageSchema.index({ groupId: 1, subgroupId: 1, createdAt: 1 });
messageSchema.index(
  { senderId: 1, directRecipientId: 1, createdAt: -1 },
  {
    name: 'direct_sender_recipient_createdAt',
    partialFilterExpression: {
      directRecipientId: { $exists: true },
      groupId: { $exists: false }
    }
  }
);

messageSchema.index(
  { directRecipientId: 1, senderId: 1, createdAt: -1 },
  {
    name: 'direct_recipient_sender_createdAt',
    partialFilterExpression: {
      directRecipientId: { $exists: true },
      groupId: { $exists: false }
    }
  }
);

module.exports = mongoose.model('Message', messageSchema);
