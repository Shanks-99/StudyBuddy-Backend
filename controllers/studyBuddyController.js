const StudyBuddyRoom = require("../models/StudyBuddyRoom");
const StudyBuddyMessage = require("../models/StudyBuddyMessage");

// @desc    Create a new study buddy room
// @route   POST /api/studybuddy
// @access  Private
const createRoom = async (req, res) => {
    try {
        const { name, description, subject, userId, isPrivate, passcode } = req.body;

        if (!name || !subject || !userId) {
            return res.status(400).json({ message: "Room name, subject, and host user ID are required" });
        }

        const newRoom = await StudyBuddyRoom.create({
            name,
            description,
            subject,
            host: userId,
            isPrivate: !!isPrivate,
            passcode: isPrivate ? passcode : null,
            status: "waiting",
            notes: "",
            todos: []
        });

        res.status(201).json(newRoom);
    } catch (error) {
        console.error("Error creating study buddy room:", error);
        res.status(500).json({ message: "Server Error" });
    }
};

// @desc    Get all active study buddy rooms (waiting or active, not completed, not private unless searching)
// @route   GET /api/studybuddy
// @access  Private
const getRooms = async (req, res) => {
    try {
        const rooms = await StudyBuddyRoom.find({ status: { $ne: "completed" } })
            .populate("host", "name email")
            .populate("buddy", "name email")
            .sort({ createdAt: -1 });

        res.status(200).json(rooms);
    } catch (error) {
        console.error("Error fetching study buddy rooms:", error);
        res.status(500).json({ message: "Server Error" });
    }
};

// @desc    Get details of a single study buddy room
// @route   GET /api/studybuddy/:roomId
// @access  Private
const getRoomById = async (req, res) => {
    try {
        const { roomId } = req.params;
        const room = await StudyBuddyRoom.findById(roomId)
            .populate("host", "name email")
            .populate("buddy", "name email");

        if (!room) {
            return res.status(404).json({ message: "Study buddy room not found" });
        }

        res.status(200).json(room);
    } catch (error) {
        console.error("Error fetching study buddy room:", error);
        res.status(500).json({ message: "Server Error" });
    }
};

// @desc    Join a study buddy room (enforcing 2-person limit & passcode)
// @route   PUT /api/studybuddy/join/:roomId
// @access  Private
const joinRoom = async (req, res) => {
    try {
        const { roomId } = req.params;
        const { userId, passcode } = req.body;

        if (!userId) {
            return res.status(400).json({ message: "User ID is required to join" });
        }

        const room = await StudyBuddyRoom.findById(roomId);

        if (!room) {
            return res.status(404).json({ message: "Room not found" });
        }

        if (room.status === "completed") {
            return res.status(400).json({ message: "This study session has already ended" });
        }

        // Re-entry check
        const isHost = String(room.host) === String(userId);
        const isBuddy = room.buddy && String(room.buddy) === String(userId);

        if (isHost || isBuddy) {
            // Already part of the room (re-joining)
            return res.status(200).json(room);
        }

        // Occupancy Check: If buddy is already set and it's a different person, room is full
        if (room.buddy) {
            return res.status(400).json({ message: "Room is full. This module only allows 2 people." });
        }

        // Passcode Check for private rooms
        if (room.isPrivate) {
            if (room.passcode && room.passcode !== passcode) {
                return res.status(401).json({ message: "Incorrect passcode for this private room" });
            }
        }

        // All checks pass: join the room as buddy and activate
        room.buddy = userId;
        room.status = "active";
        await room.save();

        const updatedRoom = await StudyBuddyRoom.findById(roomId)
            .populate("host", "name email")
            .populate("buddy", "name email");

        res.status(200).json(updatedRoom);
    } catch (error) {
        console.error("Error joining study buddy room:", error);
        res.status(500).json({ message: "Server Error" });
    }
};

// @desc    Leave/Disconnect from a study buddy room (clearing buddy slot if waiting or resetting)
// @route   PUT /api/studybuddy/leave/:roomId
// @access  Private
const leaveRoom = async (req, res) => {
    try {
        const { roomId } = req.params;
        const { userId } = req.body;

        const room = await StudyBuddyRoom.findById(roomId);
        if (!room) {
            return res.status(404).json({ message: "Room not found" });
        }

        // If host leaves, the room is typically marked as completed
        if (String(room.host) === String(userId)) {
            room.status = "completed";
        } else if (room.buddy && String(room.buddy) === String(userId)) {
            // If buddy leaves, we can reset buddy to null and set status to waiting, allowing someone else to join
            room.buddy = null;
            room.status = "waiting";
        }

        await room.save();
        res.status(200).json({ message: "Left room successfully", room });
    } catch (error) {
        console.error("Error leaving study buddy room:", error);
        res.status(500).json({ message: "Server Error" });
    }
};

// @desc    Complete/end the study buddy session
// @route   PUT /api/studybuddy/complete/:roomId
// @access  Private
const completeRoom = async (req, res) => {
    try {
        const { roomId } = req.params;
        const room = await StudyBuddyRoom.findById(roomId);

        if (!room) {
            return res.status(404).json({ message: "Room not found" });
        }

        room.status = "completed";
        await room.save();

        res.status(200).json({ message: "Room completed successfully", room });
    } catch (error) {
        console.error("Error completing study buddy room:", error);
        res.status(500).json({ message: "Server Error" });
    }
};

// @desc    Get chat history for a study buddy room
// @route   GET /api/studybuddy/:roomId/messages
// @access  Private
const getMessages = async (req, res) => {
    try {
        const { roomId } = req.params;
        const messages = await StudyBuddyMessage.find({ roomId })
            .populate("sender", "name")
            .sort({ createdAt: 1 })
            .limit(100);

        res.status(200).json(messages);
    } catch (error) {
        console.error("Error fetching study buddy messages:", error);
        res.status(500).json({ message: "Server Error" });
    }
};

// @desc    Sync notes content
// @route   PUT /api/studybuddy/:roomId/notes
// @access  Private
const syncNotes = async (req, res) => {
    try {
        const { roomId } = req.params;
        const { notes } = req.body;

        const room = await StudyBuddyRoom.findByIdAndUpdate(roomId, { notes }, { new: true });
        if (!room) {
            return res.status(404).json({ message: "Room not found" });
        }

        res.status(200).json(room);
    } catch (error) {
        console.error("Error syncing notes:", error);
        res.status(500).json({ message: "Server Error" });
    }
};

// @desc    Sync todo checklist
// @route   PUT /api/studybuddy/:roomId/todos
// @access  Private
const syncTodos = async (req, res) => {
    try {
        const { roomId } = req.params;
        const { todos } = req.body;

        const room = await StudyBuddyRoom.findByIdAndUpdate(roomId, { todos }, { new: true });
        if (!room) {
            return res.status(404).json({ message: "Room not found" });
        }

        res.status(200).json(room);
    } catch (error) {
        console.error("Error syncing todos:", error);
        res.status(500).json({ message: "Server Error" });
    }
};

module.exports = {
    createRoom,
    getRooms,
    getRoomById,
    joinRoom,
    leaveRoom,
    completeRoom,
    getMessages,
    syncNotes,
    syncTodos
};
