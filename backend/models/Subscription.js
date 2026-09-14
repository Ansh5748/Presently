const mongoose = require('mongoose');

const subscriptionSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  email: {
    type: String,
    required: true
  },
  plan: {
    type: String,
    required: true,
    default: 'free'
  },
  currency: {
    type: String,
    default: 'INR'
  },
  amount: {
    type: Number,
    default: 0
  },
  status: {
    type: String,
    default: 'active'
  },
  paymentMethod: {
    type: String,
    default: 'auto_approved'
  },
  paymentId: String,
  orderId: String,
  startDate: Date,
  expiresAt: Date,
  isAutoApproved: {
    type: Boolean,
    default: false
  },
  adminMessage: {
    type: String
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

// Index for quick active subscription lookup
subscriptionSchema.index({ userId: 1, status: 1, expiresAt: 1 });

module.exports = mongoose.model('Subscription', subscriptionSchema);
