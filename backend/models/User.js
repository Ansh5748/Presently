const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true
  },
  phone: {
    type: String,
    default: '',
    trim: true
  },
  timeZone: {
    type: String,
    default: '',
    trim: true
  },
  workingTimeStart: {
    type: String,
    default: '',
    trim: true
  },
  workingTimeEnd: {
    type: String,
    default: '',
    trim: true
  },
  statusText: {
    type: String,
    default: '',
    trim: true
  },
  about: {
    type: String,
    default: '',
    trim: true
  },
  avatarUrl: {
    type: String,
    default: '',
    trim: true
  },
  avatarPlaceholderUrl: { 
    type: String, 
    default: '', 
    trim: true 
  },
  password: {
    type: String,
    required: true
  },
  isLocalComputeEnabled: {
    type: Boolean,
    default: false
  },
  refreshTokens: [{
    type: String
  }],
  passwordResetToken: String,
  passwordResetExpires: Date,
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

// Method to compare password
userSchema.methods.comparePassword = async function(candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

module.exports = mongoose.model('User', userSchema);
