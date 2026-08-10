const mongoose = require('mongoose');

const deviceSchema = new mongoose.Schema({
  deviceId: {
    type: String,
    required: true,
    unique: true
  },
  deviceName: {
    type: String,
    default: 'Unknown Device'
  },
  brand: String,
  model: String,
  androidVersion: String,
  appVersion: String,
  ipAddress: String,
  isOnline: {
    type: Boolean,
    default: false
  },
  socketId: String,
  lastSeen: {
    type: Date,
    default: Date.now
  },
  registeredAt: {
    type: Date,
    default: Date.now
  },
  metadata: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  }
});

deviceSchema.index({ isOnline: 1 });

module.exports = mongoose.model('Device', deviceSchema);
