const StudyRoom = require("../models/StudyRoom");
const Message = require("../models/Message");

// @desc    Create a new study room
// @route   POST /api/studyrooms
// @access  Private
const createRoom = async (req, res) => {
    try {
        const { name, description, userId } = req.body;

        if (!name || !userId) {
            return res.status(400).json({ message: "Room name and user ID are required" });
        }

        const newRoom = await StudyRoom.create({
            name,
            description,
            createdBy: userId,
        });

        res.status(201).json(newRoom);
    } catch (error) {
        console.error("Error creating room:", error);
        res.status(500).json({ message: "Server Error" });
    }
};

// @desc    Get all study rooms
// @route   GET /api/studyrooms
// @access  Public/Private
const getRooms = async (req, res) => {
    try {
        const rooms = await StudyRoom.find().populate('createdBy', 'name email').sort({ createdAt: -1 });
        res.status(200).json(rooms);
    } catch (error) {
        console.error("Error fetching rooms:", error);
        res.status(500).json({ message: "Server Error" });
    }
};

// @desc    Get chat history for a room
// @route   GET /api/studyrooms/:roomId/messages
// @access  Private
const getMessages = async (req, res) => {
    try {
        const { roomId } = req.params;
        // Get last 50 messages for performance, can implement pagination later
        const messages = await Message.find({ roomId })
            .populate('sender', 'name')
            .sort({ createdAt: 1 })
            .limit(50);
        res.status(200).json(messages);
    } catch (error) {
        console.error("Error fetching messages:", error);
        res.status(500).json({ message: "Server Error" });
    }
};

// @desc    Get a specific study room by ID
// @route   GET /api/studyrooms/:roomId
// @access  Private
const getRoomById = async (req, res) => {
    try {
        const { roomId } = req.params;
        const room = await StudyRoom.findById(roomId).populate('createdBy', 'name email');

        if (!room) {
            return res.status(404).json({ message: "Room not found" });
        }
        res.status(200).json(room);
    } catch (error) {
        console.error("Error fetching room:", error);
        res.status(500).json({ message: "Server Error" });
    }
};

// @desc    Delete a study room
// @route   DELETE /api/studyrooms/:roomId
// @access  Private
const deleteRoom = async (req, res) => {
    try {
        const { roomId } = req.params;

        const room = await StudyRoom.findById(roomId);
        if (!room) {
            return res.status(404).json({ message: "Room not found" });
        }

        // Only allow the creator to delete the room
        // Since we don't have auth middleware protecting the route right now with req.user, 
        // we'll rely on the frontend sending the user ID or just delete it.
        // For standard security, you'd check: if (room.createdBy.toString() !== req.user.id)

        await StudyRoom.findByIdAndDelete(roomId);
        // Also delete associated messages
        await Message.deleteMany({ roomId: roomId });

        res.status(200).json({ message: "Room deleted successfully" });
    } catch (error) {
        console.error("Error deleting room:", error);
        res.status(500).json({ message: "Server Error" });
    }
};

module.exports = {
    createRoom,
    getRooms,
    getMessages,
    getRoomById,
    deleteRoom
};
