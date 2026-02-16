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
    enum: ['1_month', '6_month', '12_month'],
    required: true
  },
  currency: {
    type: String,
    enum: ['USD', 'INR'],
    required: true
  },
  amount: {
    type: Number,
    required: true
  },
  status: {
    type: String,
    enum: ['pending', 'active', 'expired', 'cancelled', 'pending_verification', 'rejected'],
    default: 'pending'
  },
  paymentMethod: {
    type: String,
    enum: ['razorpay', 'paypal', 'upi', 'auto_approved', 'manual'],
    required: true
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
