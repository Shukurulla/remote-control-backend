require("dotenv").config();

const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const mongoose = require("mongoose");
const cors = require("cors");
const path = require("path");

const authRoutes = require("./routes/auth");
const devicesRoutes = require("./routes/devices");
const { router: commandsRoutes, setIo } = require("./routes/commands");
const setupSocketHandlers = require("./socket/socketHandler");
const Admin = require("./models/Admin");

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
});

// Middleware
app.use(cors());
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "../public")));

// Routes
app.use("/api/auth", authRoutes);
app.use("/api/devices", devicesRoutes);
app.use("/api/commands", commandsRoutes);

// Set io for commands
setIo(io);

// Socket handlers
setupSocketHandlers(io);

// // Admin panel
// app.get('/', (req, res) => {
//   res.sendFile(path.join(__dirname, '../public/index.html'));
// });

// Health check
app.get("/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date() });
});

// Default admin yaratish
const createDefaultAdmin = async () => {
  try {
    const adminExists = await Admin.findOne({
      username: process.env.ADMIN_USERNAME,
    });
    if (!adminExists) {
      await Admin.create({
        username: process.env.ADMIN_USERNAME || "system_admin",
        password: process.env.ADMIN_PASSWORD || "7Fv#29Lm!Qp4",
      });
      console.log("Default admin yaratildi");
    }
  } catch (error) {
    console.error("Admin yaratish xatosi:", error);
  }
};

// MongoDB ulanish va server ishga tushirish
const PORT = process.env.PORT || 3000;
const os = require("os");

// WiFi IP olish
const getLocalIP = () => {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === "IPv4" && !iface.internal) {
        return iface.address;
      }
    }
  }
  return "localhost";
};

mongoose
  .connect(process.env.MONGODB_URI)
  .then(async () => {
    console.log("✅ MongoDB ulandi");
    await createDefaultAdmin();

    const localIP = getLocalIP();

    server.listen(PORT, "0.0.0.0", () => {
      console.log("\n========================================");
      console.log("🚀 SERVER ISHGA TUSHDI!");
      console.log("========================================");
      console.log(`📍 Local:    http://localhost:${PORT}`);
      console.log(`📍 Network:  http://${localIP}:${PORT}`);
      console.log("========================================");
      console.log("📱 Telefonda shu manzilni kiriting:");
      console.log(`   http://${localIP}:${PORT}`);
      console.log("========================================\n");
    });
  })
  .catch((error) => {
    console.error("MongoDB ulanish xatosi:", error);
    process.exit(1);
  });

// Graceful shutdown
process.on("SIGINT", async () => {
  console.log("Server to'xtatilmoqda...");
  await mongoose.connection.close();
  process.exit(0);
});
