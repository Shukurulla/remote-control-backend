const express = require('express');
const Command = require('../models/Command');
const Device = require('../models/Device');
const authMiddleware = require('../middleware/auth');
const { generateComments } = require('../services/geminiService');

const router = express.Router();

// Io instance saqlanadi
let io = null;

const setIo = (socketIo) => {
  io = socketIo;
};

// Buyruq yuborish
router.post('/send', authMiddleware, async (req, res) => {
  try {
    const { deviceId, command, params } = req.body;

    console.log(`\n📤 Buyruq so'rovi: ${command} -> ${deviceId}`);

    const device = await Device.findOne({ deviceId });
    if (!device) {
      console.log('❌ Qurilma topilmadi');
      return res.status(404).json({ error: 'Qurilma topilmadi' });
    }

    console.log(`   Device online: ${device.isOnline}`);
    console.log(`   Socket ID: ${device.socketId}`);
    console.log(`   IO mavjud: ${!!io}`);

    const cmd = new Command({
      deviceId,
      command,
      params,
      status: 'pending'
    });
    await cmd.save();

    // Agar qurilma online bo'lsa, buyruqni yuborish
    if (device.isOnline && device.socketId && io) {
      io.to(device.socketId).emit('command', {
        commandId: cmd._id,
        command: cmd.command,
        params: cmd.params
      });
      cmd.status = 'sent';
      await cmd.save();
      console.log(`✅ Buyruq yuborildi: ${command}`);
    } else {
      console.log(`⚠️ Buyruq yuborilmadi - qurilma offline yoki socket yo'q`);
    }

    res.json({ success: true, command: cmd });
  } catch (error) {
    console.error('❌ Buyruq xatosi:', error);
    res.status(500).json({ error: error.message });
  }
});

// Bitta buyruq ma'lumotini olish (progressHistory bilan)
// Admin panel real-time siz ham progress ni ko'rsatishi uchun
router.get('/:id', authMiddleware, async (req, res) => {
  try {
    const cmd = await Command.findById(req.params.id);
    if (!cmd) return res.status(404).json({ error: 'Buyruq topilmadi' });
    res.json(cmd);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Bir nechta buyruqlarni bir vaqtda olish (batched)
router.post('/batch', authMiddleware, async (req, res) => {
  try {
    const { ids } = req.body;
    if (!Array.isArray(ids) || !ids.length) {
      return res.json([]);
    }
    const valid = ids.filter((id) => /^[a-f\d]{24}$/i.test(id));
    const commands = await Command.find({ _id: { $in: valid } });
    res.json(commands);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Qurilmaning buyruqlar tarixi
router.get('/history/:deviceId', authMiddleware, async (req, res) => {
  try {
    const commands = await Command.find({ deviceId: req.params.deviceId })
      .sort({ createdAt: -1 })
      .limit(100);
    res.json(commands);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Barcha buyruqlar
router.get('/', authMiddleware, async (req, res) => {
  try {
    const commands = await Command.find()
      .sort({ createdAt: -1 })
      .limit(200);
    res.json(commands);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Pending buyruqlarni olish (mobil ilovadan)
router.get('/pending/:deviceId', async (req, res) => {
  try {
    const commands = await Command.find({
      deviceId: req.params.deviceId,
      status: { $in: ['pending', 'sent'] }
    }).sort({ createdAt: 1 });

    res.json(commands);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Buyruq progress ni yangilash (mobil ilovadan)
router.post('/progress', async (req, res) => {
  try {
    const { commandId, step, message } = req.body;

    console.log(`\n📊 Progress update: commandId=${commandId}, step=${step}`);

    const cmd = await Command.findById(commandId);
    if (!cmd) {
      return res.status(404).json({ error: 'Buyruq topilmadi' });
    }

    // Progress ni yangilash
    cmd.progress = {
      step,
      message: message || '',
      timestamp: new Date()
    };

    // Progress history ga qo'shish
    if (!cmd.progressHistory) {
      cmd.progressHistory = [];
    }
    cmd.progressHistory.push({
      step,
      message: message || '',
      timestamp: new Date()
    });

    // Status ni avtomatik yangilash
    if (step === 'completed') {
      cmd.status = 'executed';
    } else if (step === 'failed') {
      cmd.status = 'failed';
    } else if (step === 'received') {
      cmd.status = 'sent';
    } else {
      cmd.status = 'executing';
    }

    await cmd.save();

    console.log(`✅ Progress saqlandi: ${step} - ${message || 'no message'}`);

    // Admin panelga real-time yuborish
    if (io) {
      io.emit('command_progress', {
        commandId: cmd._id,
        deviceId: cmd.deviceId,
        command: cmd.command,
        step,
        message,
        timestamp: new Date()
      });
    }

    res.json({ success: true });
  } catch (error) {
    console.error('❌ Progress xatosi:', error);
    res.status(500).json({ error: error.message });
  }
});

// Buyruq natijasini yangilash (mobil ilovadan)
router.post('/result', async (req, res) => {
  try {
    const { commandId, status, result, error, actualComment, screenshotBase64 } = req.body;

    console.log(`\n📥 Natija keldi: commandId=${commandId}, status=${status}`);

    const cmd = await Command.findById(commandId);
    if (!cmd) {
      return res.status(404).json({ error: 'Buyruq topilmadi' });
    }

    const now = new Date();
    const duration = cmd.sentAt ? now - cmd.sentAt : 0;

    cmd.status = status;
    cmd.result = result;
    cmd.error = error;
    cmd.executedAt = now;
    cmd.duration = duration;

    // Aslida yozilgan comment ni saqlash
    if (actualComment) {
      cmd.actualComment = actualComment;
    }

    // Screenshot (agar yuborilgan bo'lsa)
    if (screenshotBase64) {
      // Hozircha faqat base64 sifatida saqlaymiz
      // Keyinchalik file sifatida saqlash mumkin
      cmd.screenshotUrl = screenshotBase64;
    }

    await cmd.save();

    console.log(`✅ Natija saqlandi: ${status}, duration: ${duration}ms`);

    // Admin panelga natijani yuborish
    if (io) {
      io.emit('command_result', {
        commandId: cmd._id,
        deviceId: cmd.deviceId,
        command: cmd.command,
        status: cmd.status,
        result: cmd.result,
        error: cmd.error,
        actualComment: cmd.actualComment,
        generatedComment: cmd.params?.commentText,
        duration: cmd.duration,
        executedAt: cmd.executedAt
      });
    }

    res.json({ success: true });
  } catch (error) {
    console.error('❌ Result xatosi:', error);
    res.status(500).json({ error: error.message });
  }
});

// AI yordamida Instagram comment generatsiya qilib yuborish
router.post('/ai-comment', authMiddleware, async (req, res) => {
  try {
    const { postUrl, postDescription, tone, lang, deviceIds } = req.body;

    if (!postUrl || !postDescription || !deviceIds || !deviceIds.length) {
      return res.status(400).json({ error: 'postUrl, postDescription va deviceIds majburiy' });
    }

    const commentTone = tone || 'positive';
    const commentLang = lang || 'uz';

    console.log(`\n🤖 AI Comment so'rovi: ${deviceIds.length} ta qurilma uchun`);
    console.log(`   Post: ${postUrl}`);
    console.log(`   Tone: ${commentTone}, Lang: ${commentLang}`);

    // Gemini orqali commentlar generatsiya qilish
    const comments = await generateComments(postDescription, deviceIds.length, commentTone, commentLang);

    console.log(`   Gemini ${comments.length} ta comment yaratdi`);

    const results = [];

    for (let i = 0; i < deviceIds.length; i++) {
      const deviceId = deviceIds[i];
      const commentText = comments[i] || comments[comments.length - 1];

      const device = await Device.findOne({ deviceId });
      if (!device) {
        results.push({ deviceId, success: false, error: 'Qurilma topilmadi' });
        continue;
      }

      const cmd = new Command({
        deviceId,
        command: 'post_instagram_comment',
        params: { postUrl, commentText },
        generatedComment: commentText, // AI generatsiya qilgan comment
        status: 'pending'
      });
      await cmd.save();

      if (device.isOnline && device.socketId && io) {
        io.to(device.socketId).emit('command', {
          commandId: cmd._id,
          command: cmd.command,
          params: cmd.params
        });
        cmd.status = 'sent';
        cmd.sentAt = new Date();
        await cmd.save();
      }

      results.push({ deviceId, success: true, comment: commentText, status: cmd.status, commandId: cmd._id.toString() });
    }

    console.log(`✅ AI Comment: ${results.filter(r => r.success).length}/${deviceIds.length} yuborildi`);

    res.json({ success: true, results });
  } catch (error) {
    console.error('❌ AI Comment xatosi:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = { router, setIo };
