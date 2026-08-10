const mongoose = require('mongoose');

const commandSchema = new mongoose.Schema({
  deviceId: {
    type: String,
    required: true
  },
  command: {
    type: String,
    required: true,
    enum: [
      // Xabar yuborish
      'send_telegram_message',
      'send_whatsapp_message',
      'send_instagram_message',
      // Post kommentariyalar (Yangi!)
      'post_telegram_comment',
      'post_instagram_comment',
      // Eski (muvofiqlik uchun saqlab qolindi)
      'open_app',
      'close_app',
      'get_screenshot',
      'get_contacts',
      'get_sms',
      'make_call',
      'send_sms',
      'get_location',
      'get_installed_apps',
      'custom_command'
    ]
  },
  params: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },
  status: {
    type: String,
    enum: ['pending', 'sent', 'delivered', 'executing', 'executed', 'failed'],
    default: 'pending'
  },
  result: {
    type: mongoose.Schema.Types.Mixed,
    default: null
  },
  error: String,
  generatedComment: String, // AI tomonidan generatsiya qilingan comment
  actualComment: String, // Aslida yozilgan comment (APK dan keladi)
  screenshotUrl: String, // Screenshot (agar bo'lsa)
  createdAt: {
    type: Date,
    default: Date.now
  },
  sentAt: Date, // Buyruq APK ga yuborilgan vaqt
  executedAt: Date, // APK bajarib bo'lgan vaqt
  duration: Number // Bajarilish davomiyligi (ms)
});

commandSchema.index({ deviceId: 1, status: 1 });
commandSchema.index({ createdAt: -1 });

module.exports = mongoose.model('Command', commandSchema);
