const Device = require('../models/Device');
const Command = require('../models/Command');

const setupSocketHandlers = (io) => {
  io.on('connection', (socket) => {
    console.log('🔌 Yangi socket ulanish:', socket.id);

    // Qurilma ulanishi
    socket.on('device_connect', async (data) => {
      try {
        const { deviceId, deviceName, brand, model, androidVersion, appVersion } = data;

        let device = await Device.findOne({ deviceId });

        if (device) {
          device.isOnline = true;
          device.socketId = socket.id;
          device.lastSeen = new Date();
          device.deviceName = deviceName || device.deviceName;
          device.brand = brand || device.brand;
          device.model = model || device.model;
          device.androidVersion = androidVersion || device.androidVersion;
          device.appVersion = appVersion || device.appVersion;
          await device.save();
        } else {
          device = new Device({
            deviceId,
            deviceName: deviceName || `${brand} ${model}`,
            brand,
            model,
            androidVersion,
            appVersion,
            isOnline: true,
            socketId: socket.id
          });
          await device.save();
        }

        // Qurilmani room'ga qo'shish
        socket.join(`device_${deviceId}`);
        socket.deviceId = deviceId;

        // Admin panelga yangi qurilma haqida xabar
        io.emit('device_online', {
          deviceId: device.deviceId,
          deviceName: device.deviceName,
          brand: device.brand,
          model: device.model
        });

        // Pending buyruqlarni yuborish
        const pendingCommands = await Command.find({
          deviceId,
          status: { $in: ['pending', 'sent'] }
        });

        for (const cmd of pendingCommands) {
          socket.emit('command', {
            commandId: cmd._id,
            command: cmd.command,
            params: cmd.params
          });
          cmd.status = 'sent';
          await cmd.save();
        }

        console.log('\n========================================');
        console.log('📱 TELEFON ULANDI!');
        console.log('========================================');
        console.log(`   Qurilma: ${deviceName}`);
        console.log(`   Brand:   ${brand} ${model}`);
        console.log(`   Android: ${androidVersion}`);
        console.log(`   ID:      ${deviceId}`);
        console.log('========================================\n');
      } catch (error) {
        console.error('Device connect xatosi:', error);
      }
    });

    // Buyruq natijasi
    socket.on('command_result', async (data) => {
      try {
        const { commandId, status, result, error, actualComment, screenshotBase64 } = data;

        console.log(`\n📥 Command result: commandId=${commandId}, status=${status}`);

        const cmd = await Command.findById(commandId);
        if (cmd) {
          const now = new Date();
          const duration = cmd.sentAt ? now - cmd.sentAt : 0;

          cmd.status = status;
          cmd.result = result;
          cmd.error = error;
          cmd.executedAt = now;
          cmd.duration = duration;

          // Aslida yozilgan comment
          if (actualComment) {
            cmd.actualComment = actualComment;
          }

          // Screenshot (agar bo'lsa)
          if (screenshotBase64) {
            cmd.screenshotUrl = screenshotBase64;
          }

          await cmd.save();

          console.log(`✅ Natija saqlandi: ${status}, duration: ${duration}ms`);
          if (actualComment) {
            console.log(`   Generated: ${cmd.params?.commentText?.substring(0, 50)}...`);
            console.log(`   Actual:    ${actualComment.substring(0, 50)}...`);
          }

          // Admin panelga natijani yuborish
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
      } catch (error) {
        console.error('Command result xatosi:', error);
      }
    });

    // Qurilma holati (heartbeat)
    socket.on('heartbeat', async (data) => {
      try {
        const { deviceId } = data;
        await Device.updateOne(
          { deviceId },
          { lastSeen: new Date(), isOnline: true }
        );
      } catch (error) {
        console.error('Heartbeat xatosi:', error);
      }
    });

    // Screenshot yoki boshqa ma'lumotlar
    socket.on('data_response', async (data) => {
      try {
        const { commandId, type, payload } = data;

        const cmd = await Command.findById(commandId);
        if (cmd) {
          cmd.status = 'executed';
          cmd.result = { type, payload };
          cmd.executedAt = new Date();
          await cmd.save();

          io.emit('data_response', {
            commandId,
            deviceId: cmd.deviceId,
            type,
            payload
          });
        }
      } catch (error) {
        console.error('Data response xatosi:', error);
      }
    });

    // Ulanish uzilishi
    socket.on('disconnect', async () => {
      try {
        if (socket.deviceId) {
          await Device.updateOne(
            { deviceId: socket.deviceId },
            { isOnline: false, socketId: null }
          );

          io.emit('device_offline', { deviceId: socket.deviceId });
          console.log(`\n❌ TELEFON UZILDI: ${socket.deviceId}\n`);
        }
      } catch (error) {
        console.error('Disconnect xatosi:', error);
      }
    });
  });
};

module.exports = setupSocketHandlers;
