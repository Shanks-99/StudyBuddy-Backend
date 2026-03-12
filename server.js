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
    socket.join(roomId);

    // Add user to memory state
    if (!roomUsers[roomId]) {
      roomUsers[roomId] = [];
    }

    // Only add if not already in the list for this socket
    const existingUser = roomUsers[roomId].find(u => u.socketId === socket.id);
    if (!existingUser) {
      const newUser = { socketId: socket.id, userId, name };
      roomUsers[roomId].push(newUser);
    }

    // Broadcast updated participant list to everyone in the room
    io.to(roomId).emit("room-users", roomUsers[roomId]);

    // Optional: Notify others that this user joined (handled gracefully by frontend usually)
    socket.to(roomId).emit("user-joined", { socketId: socket.id, userId, name });
  });

  socket.on("send-message", async (data) => {
    // data: { roomId, sender (userId), text, name }
    try {
      const Message = require("./models/Message");

      // Save to database
      const newMessage = await Message.create({
        roomId: data.roomId,
        sender: data.sender,
        text: data.text
      });

      // Populate sender name before sending back
      await newMessage.populate('sender', 'name');

      // Broadcast to room
      io.to(data.roomId).emit("receive-message", newMessage);
    } catch (err) {
      console.error("Socket send-message error:", err);
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
    console.log("User disconnected:", socket.id);
    // Find rooms this user was in, remove them, and broadcast new list
    for (const roomId in roomUsers) {
      const index = roomUsers[roomId].findIndex(u => u.socketId === socket.id);
      if (index !== -1) {
        roomUsers[roomId].splice(index, 1);
        io.to(roomId).emit("room-users", roomUsers[roomId]);
        socket.to(roomId).emit("user-left", socket.id);
        break; // Assuming a socket is only in one room at a time for this app
      }
    }
  });
});

// Middlewares
app.use(cors());
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
