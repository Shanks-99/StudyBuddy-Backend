const dotenv = require("dotenv");
dotenv.config();

const express = require("express");
const cors = require("cors");
const http = require("http");
const { Server } = require("socket.io");
const connectDB = require("./config/db");
const authRoutes = require("./routes/authRoutes");
const notesRoutes = require("./routes/notesRoutes");
const quizRoutes = require("./routes/quizRoutes");
const focusRoutes = require("./routes/focusRoutes");
const studyRoomRoutes = require("./routes/studyRoomRoutes");
const mentorshipRoutes = require("./routes/mentorshipRoutes");
const adminRoutes = require("./routes/adminRoutes");
const studyBuddyRoutes = require("./routes/studyBuddyRoutes");
const communityRoutes = require("./routes/communityRoutes");
const resourceRoutes = require("./routes/resourceRoutes");
const groupSessionRoutes = require("./routes/groupSessionRoutes");
const directMessageRoutes = require("./routes/directMessageRoutes");
const taskRoutes = require("./routes/taskRoutes");
const { startJob: startSessionReminderJob } = require("./jobs/sessionReminderJob");

// Initialize express app FIRST
const app = express();

// MOVE CORS TO THE TOP
app.use(cors({
  origin: "*", 
  methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With", "Accept"],
  credentials: true
}));

// Add COOP header for Google Auth popups
app.use((req, res, next) => {
  res.header("Cross-Origin-Opener-Policy", "same-origin-allow-popups");
  next();
});

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
const buddyRoomUsers = {};

io.on("connection", (socket) => {
  console.log("User connected:", socket.id);

  // --- Study Room Socket Logic ---
  socket.on("join-room", async ({ roomId, userId, name }) => {
    if (!userId) {
      console.error(`[Socket] join-room failed: Missing userId for user ${name}`);
      return;
    }

    console.log(`[Socket] User ${name} (${userId}) attempting to join room ${roomId}`);

    try {
      const StudyRoom = require("./models/StudyRoom");
      const roomInfo = await StudyRoom.findById(roomId);
      if (roomInfo && roomInfo.maxParticipants) {
        const activeUsersCount = roomUsers[roomId] ? roomUsers[roomId].length : 0;
        const isAlreadyIn = roomUsers[roomId] && roomUsers[roomId].some(u => String(u.userId) === String(userId));
        
        if (!isAlreadyIn && activeUsersCount >= roomInfo.maxParticipants) {
          console.warn(`[Socket] Room ${roomId} is full: ${activeUsersCount}/${roomInfo.maxParticipants}`);
          socket.emit("room-full", { maxParticipants: roomInfo.maxParticipants });
          return;
        }
      }
    } catch (err) {
      console.error("[Socket] Error looking up room info:", err);
    }

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
  // Unified signal relay — forwards ALL SimplePeer signaling data as-is
  socket.on("webrtc-signal", ({ signal, to }) => {
    console.log(`[WebRTC] Relaying signal from ${socket.id} to ${to}, type=${signal.type || 'ice'}`);
    socket.to(to).emit("webrtc-signal", { signal, from: socket.id });
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

  // --- Study Buddy Socket Logic ---
  socket.on("join-buddy-room", ({ roomId, userId, name }) => {
    if (!userId) {
      console.error(`[Socket] join-buddy-room failed: Missing userId for user ${name}`);
      return;
    }

    console.log(`[Socket] User ${name} (${userId}) attempting to join buddy room ${roomId}`);

    if (!buddyRoomUsers[roomId]) {
      buddyRoomUsers[roomId] = [];
    }

    // Strict 2-person constraint check:
    const activeUserIds = buddyRoomUsers[roomId].map(u => String(u.userId));
    const isAlreadyInRoom = activeUserIds.includes(String(userId));

    if (buddyRoomUsers[roomId].length >= 2 && !isAlreadyInRoom) {
      console.log(`[Socket] Denied join to buddy room ${roomId} (full). Users:`, activeUserIds);
      socket.emit("buddy-room-full", { message: "This room already has 2 participants." });
      return;
    }

    // Cleanup stale entries
    buddyRoomUsers[roomId] = buddyRoomUsers[roomId].filter(u => String(u.userId) !== String(userId));

    socket.join(roomId);
    const newUser = { socketId: socket.id, userId, name };
    buddyRoomUsers[roomId].push(newUser);

    console.log(`[Socket] Buddy Room ${roomId} active participants:`, buddyRoomUsers[roomId].map(u => u.name));

    // Broadcast updated participant list
    io.to(roomId).emit("buddy-room-users", buddyRoomUsers[roomId]);

    // Notify other user
    socket.to(roomId).emit("buddy-user-joined", { socketId: socket.id, userId, name });
  });

  socket.on("send-buddy-message", async (data) => {
    try {
      const StudyBuddyMessage = require("./models/StudyBuddyMessage");
      const newMsg = await StudyBuddyMessage.create({
        roomId: data.roomId,
        sender: data.sender,
        text: data.text
      });
      await newMsg.populate("sender", "name");
      io.to(data.roomId).emit("receive-buddy-message", newMsg);
    } catch (err) {
      console.error("[Buddy Chat] Error:", err);
    }
  });

  socket.on("buddy-notes-change", ({ roomId, notes }) => {
    socket.to(roomId).emit("buddy-notes-change", { notes });
  });

  socket.on("buddy-todo-change", ({ roomId, todos }) => {
    socket.to(roomId).emit("buddy-todo-change", { todos });
  });

  socket.on("buddy-timer-control", ({ roomId, action, value }) => {
    socket.to(roomId).emit("buddy-timer-control", { action, value });
  });

  socket.on("buddy-session-end", ({ roomId }) => {
    io.to(roomId).emit("buddy-session-ended");
    if (buddyRoomUsers[roomId]) {
      delete buddyRoomUsers[roomId];
    }
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

    // Cleanup Study Buddy Rooms
    for (const roomId in buddyRoomUsers) {
      if (buddyRoomUsers[roomId]) {
        const initialCount = buddyRoomUsers[roomId].length;
        buddyRoomUsers[roomId] = buddyRoomUsers[roomId].filter(u => u.socketId !== socket.id);
        
        if (buddyRoomUsers[roomId].length !== initialCount) {
          console.log(`[Socket] Cleaned up socket ${socket.id} from buddy room ${roomId}`);
          io.to(roomId).emit("buddy-room-users", buddyRoomUsers[roomId]);
          socket.to(roomId).emit("buddy-user-left", socket.id);
        }
      }
    }
  });
});

const notificationRoutes = require("./routes/notificationRoutes");

// Middlewares
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Connect to MongoDB
connectDB();

// Routes
app.use("/api/auth", authRoutes);
app.use("/api/notes", notesRoutes);
app.use("/api/quiz", quizRoutes);
app.use("/api/focus", focusRoutes);
app.use("/api/studyrooms", studyRoomRoutes);
app.use("/api/mentorship", mentorshipRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/studybuddy", studyBuddyRoutes);
app.use("/api/community", communityRoutes);
app.use("/api/resources", resourceRoutes);
app.use("/api/group-sessions", groupSessionRoutes);
app.use("/api/messages", directMessageRoutes);
app.use("/api/tasks", taskRoutes);

// Test Route
app.get("/", (req, res) => {
  res.send("API is working...");
});

// Start Server
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
    startSessionReminderJob();
});
