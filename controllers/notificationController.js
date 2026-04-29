const Notification = require('../models/Notification');

exports.getNotifications = async (req, res) => {
    try {
        const notifications = await Notification.find({ recipient: req.user.id })
            .sort({ createdAt: -1 })
            .limit(20);
        res.json({ notifications });
    } catch (error) {
        res.status(500).json({ message: "Error fetching notifications" });
    }
};

exports.markAsRead = async (req, res) => {
    try {
        await Notification.findByIdAndUpdate(req.params.id, { isRead: true });
        res.json({ message: "Notification marked as read" });
    } catch (error) {
        res.status(500).json({ message: "Error updating notification" });
    }
};

exports.clearAll = async (req, res) => {
    try {
        await Notification.deleteMany({ recipient: req.user.id });
        res.json({ message: "All notifications cleared" });
    } catch (error) {
        res.status(500).json({ message: "Error clearing notifications" });
    }
};

// Internal utility to create notifications
exports.createNotification = async (recipientId, title, message, type, link = null) => {
    try {
        await Notification.create({
            recipient: recipientId,
            title,
            message,
            type,
            link
        });
    } catch (error) {
        console.error("Failed to create notification:", error);
    }
};
