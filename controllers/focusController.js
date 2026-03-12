const FocusSession = require("../models/FocusSession");

// @desc    Save a completed focus session
// @route   POST /api/focus/save
// @access  Private
const saveSession = async (req, res) => {
    try {
        const { userId, duration, completedTasks } = req.body;

        if (!userId || !duration) {
            return res.status(400).json({ message: "User ID and duration are required" });
        }

        const newSession = await FocusSession.create({
            userId,
            duration,
            completedTasks: completedTasks || 0,
        });

        res.status(201).json(newSession);
    } catch (error) {
        console.error("Error saving focus session:", error);
        res.status(500).json({ message: "Server Error" });
    }
};

// @desc    Get all focus sessions for a user
// @route   GET /api/focus/:userId
// @access  Private
const getSessions = async (req, res) => {
    try {
        const { userId } = req.params;

        const sessions = await FocusSession.find({ userId }).sort({ createdAt: -1 });

        res.status(200).json(sessions);
    } catch (error) {
        console.error("Error fetching focus sessions:", error);
        res.status(500).json({ message: "Server Error" });
    }
};

module.exports = {
    saveSession,
    getSessions,
};
