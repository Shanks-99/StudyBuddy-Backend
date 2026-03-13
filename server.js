const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const http = require("http");
const { Server } = require("socket.io");
const connectDB = require("./config/db");
const authRoutes = require("./routes/authRoutes");
const notesRoutes = require("./routes/notesRoutes");
const quizRoutes = require("./routes/quizRoutes");
const focusRoutes = require("./routes/focusRoutes");
const studyRoomRoutes = require("./routes/studyRoomRoutes");

dotenv.config();

// Initialize express app FIRST
const app = express();

// MOVE CORS TO THE TOP
app.use(cors({
  origin: "*", 
  methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With", "Accept"],
  credentials: true
}));

// Create HTTP server
const server = http.createServer(app);

// Initialize Socket.io
const io = new Server(server, {
  cors: {
    origin: "*", // Allow all origins for debugging
    methods: ["GET", "POST"]
  }
});

// Make io accessible to routes
app.set("io", io);

// Keep track of users in rooms (simple memory implementation)
// Format: { roomId: [{ socketId, userId, name }] }
const roomUsers = {};

io.on("connection", (socket) => {
  console.log("User connected:", socket.id);

  // --- Study Room Socket Logic ---
  socket.on("join-room", ({ roomId, userId, name }) => {
    if (!userId) {
      console.error(`[Socket] join-room failed: Missing userId for user ${name}`);
      return;
    }

    console.log(`[Socket] User ${name} (${userId}) attempting to join room ${roomId}`);

    // --- FIX Phase 2: Cleanup FIRST ---
    if (roomUsers[roomId]) {
      const staleEntries = roomUsers[roomId].filter(u => String(u.userId) === String(userId));
      if (staleEntries.length > 0) {
        console.log(`[Socket] Cleanup: Found ${staleEntries.length} stale sessions for user ${userId}. Clearing...`);
        staleEntries.forEach(stale => {
          socket.to(roomId).emit("user-left", stale.socketId);
        });
        roomUsers[roomId] = roomUsers[roomId].filter(u => String(u.userId) !== String(userId));
      }
    } else {
      roomUsers[roomId] = [];
    }

    // Now safe to join
    socket.join(roomId);

    // Add new user entry
    const newUser = { socketId: socket.id, userId, name };
    roomUsers[roomId].push(newUser);
    
    console.log(`[Socket] Room ${roomId} active participants:`, roomUsers[roomId].map(u => u.name));

    // Broadcast updated participant list
    io.to(roomId).emit("room-users", roomUsers[roomId]);

    // Notify others
    socket.to(roomId).emit("user-joined", { socketId: socket.id, userId, name });
  });

  socket.on("send-message", async (data) => {
    try {
      const Message = require("./models/Message");
      console.log(`[Chat] Incoming -> User: ${data.name || data.sender}, ID: ${data.clientSideId || 'NONE'}`);

      // Save to database
      const newMessage = await Message.create({
        roomId: data.roomId,
        sender: data.sender,
        text: data.text
      });

      // Populate sender name before sending back
      await newMessage.populate('sender', 'name');

      // Convert to plain object to attach clientSideId
      const messageResponse = newMessage.toObject({ virtuals: true });
      messageResponse.clientSideId = data.clientSideId || null;
      
      if (messageResponse.clientSideId) {
          console.log(`[Chat] Broadcast -> Final ID attached: ${messageResponse.clientSideId}`);
      }

      // Broadcast to room
      io.to(data.roomId).emit("receive-message", messageResponse);
    } catch (err) {
      console.error("[Chat] Error:", err);
    }
  });

  // --- WebRTC Signaling ---
  // When a new user joins, existing users send an offer to them
  socket.on("webrtc-offer", ({ offer, to }) => {
    socket.to(to).emit("webrtc-offer", { offer, from: socket.id });
  });

  socket.on("webrtc-answer", ({ answer, to }) => {
    socket.to(to).emit("webrtc-answer", { answer, from: socket.id });
  });

  socket.on("webrtc-ice-candidate", ({ candidate, to }) => {
    socket.to(to).emit("webrtc-ice-candidate", { candidate, from: socket.id });
  });

  // --- End Room Logic ---
  socket.on("end-room", ({ roomId }) => {
    // Broadcast to everyone in the room that it has ended
    io.to(roomId).emit("room-ended");

    // Clear room from memory
    if (roomUsers[roomId]) {
      delete roomUsers[roomId];
    }

    // Disconnect all sockets from this room to clean up
    io.in(roomId).socketsJoin("ended-rooms-limbo"); // optional, or just let client disconnect them
    io.in(roomId).socketsLeave(roomId);
  });

  // --- Disconnect Logic ---
  socket.on("disconnect", () => {
    console.log("[Socket] User disconnected:", socket.id);
    // Find rooms this user was in, remove them, and broadcast new list
    for (const roomId in roomUsers) {
      if (roomUsers[roomId]) {
        const initialCount = roomUsers[roomId].length;
        roomUsers[roomId] = roomUsers[roomId].filter(u => u.socketId !== socket.id);
        
        if (roomUsers[roomId].length !== initialCount) {
          console.log(`[Socket] Cleaned up socket ${socket.id} from room ${roomId}`);
          io.to(roomId).emit("room-users", roomUsers[roomId]);
          socket.to(roomId).emit("user-left", socket.id);
        }
      }
    }
  });
});

// Middlewares
app.use(express.json());

// Connect to MongoDB
connectDB();

// Routes
app.use("/api/auth", authRoutes);
app.use("/api/notes", notesRoutes);
app.use("/api/quiz", quizRoutes);
app.use("/api/focus", focusRoutes);
app.use("/api/studyrooms", studyRoomRoutes);

// Test Route
app.get("/", (req, res) => {
  res.send("API is working...");
});

// Start Server
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
