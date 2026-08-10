const express = require('express');
const Device = require('../models/Device');
const authMiddleware = require('../middleware/auth');

const router = express.Router();

// Barcha qurilmalarni olish
router.get('/', authMiddleware, async (req, res) => {
  try {
    const devices = await Device.find().sort({ lastSeen: -1 });
    res.json(devices);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Online qurilmalarni olish
router.get('/online', authMiddleware, async (req, res) => {
  try {
    const devices = await Device.find({ isOnline: true });
    res.json(devices);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Bitta qurilma ma'lumotlari
router.get('/:deviceId', authMiddleware, async (req, res) => {
  try {
    const device = await Device.findOne({ deviceId: req.params.deviceId });
    if (!device) {
      return res.status(404).json({ error: 'Qurilma topilmadi' });
    }
    res.json(device);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Qurilmani o'chirish
router.delete('/:deviceId', authMiddleware, async (req, res) => {
  try {
    await Device.deleteOne({ deviceId: req.params.deviceId });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Qurilma ro'yxatdan o'tish (mobil ilovadan)
router.post('/register', async (req, res) => {
  try {
    const { deviceId, deviceName, brand, model, androidVersion, appVersion } = req.body;

    if (!deviceId) {
      return res.status(400).json({ error: 'deviceId kerak' });
    }

    let device = await Device.findOne({ deviceId });

    if (device) {
      // Mavjud qurilmani yangilash
      device.deviceName = deviceName || device.deviceName;
      device.brand = brand || device.brand;
      device.model = model || device.model;
      device.androidVersion = androidVersion || device.androidVersion;
      device.appVersion = appVersion || device.appVersion;
      device.ipAddress = req.ip;
      device.lastSeen = new Date();
      await device.save();
    } else {
      // Yangi qurilma qo'shish
      device = new Device({
        deviceId,
        deviceName: deviceName || `${brand} ${model}`,
        brand,
        model,
        androidVersion,
        appVersion,
        ipAddress: req.ip
      });
      await device.save();
    }

    res.json({ success: true, device });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
