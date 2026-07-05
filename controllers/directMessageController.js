const DirectMessage = require("../models/DirectMessage");
const User = require("../models/User");
const MentorshipSession = require("../models/MentorshipSession");

// Get a list of users connected for messaging
exports.getConversations = async (req, res) => {
    try {
        const userId = req.user.id;

        // 1. Get all unique students/mentors from mentorship sessions
        const sessions = await MentorshipSession.find({
            $or: [{ student: userId }, { mentor: userId }]
        });

        const connectedUserIds = new Set();
        sessions.forEach(s => {
            if (s.student && s.student.toString() !== userId) {
                connectedUserIds.add(s.student.toString());
            }
            if (s.mentor && s.mentor.toString() !== userId) {
                connectedUserIds.add(s.mentor.toString());
            }
        });

        // 2. Get any other users connected via direct messages
        const directMessages = await DirectMessage.find({
            $or: [{ sender: userId }, { receiver: userId }]
        });

        directMessages.forEach(dm => {
            if (dm.sender.toString() !== userId) {
                connectedUserIds.add(dm.sender.toString());
            }
            if (dm.receiver.toString() !== userId) {
                connectedUserIds.add(dm.receiver.toString());
            }
        });

        // 3. Resolve user details for all connections
        const connectionsList = [];
        for (const connId of connectedUserIds) {
            const partner = await User.findById(connId).select("name email role avatar");
            if (!partner) continue;

            // Find last message exchange
            const lastMsg = await DirectMessage.findOne({
                $or: [
                    { sender: userId, receiver: connId },
                    { sender: connId, receiver: userId }
                ]
            }).sort({ createdAt: -1 });

            // Count unread messages from this partner
            const unreadCount = await DirectMessage.countDocuments({
                sender: connId,
                receiver: userId,
                isRead: false
            });

            connectionsList.push({
                partner,
                lastMessage: lastMsg ? {
                    text: lastMsg.text,
                    createdAt: lastMsg.createdAt,
                    sender: lastMsg.sender
                } : null,
                unreadCount
            });
        }

        // Sort by last message date or alphabetically if no messages
        connectionsList.sort((a, b) => {
            if (a.lastMessage && b.lastMessage) {
                return new Date(b.lastMessage.createdAt) - new Date(a.lastMessage.createdAt);
            }
            if (a.lastMessage) return -1;
            if (b.lastMessage) return 1;
            return a.partner.name.localeCompare(b.partner.name);
        });

        res.status(200).json(connectionsList);
    } catch (error) {
        console.error("getConversations error:", error);
        res.status(500).json({ message: "Failed to fetch conversations", error: error.message });
    }
};

// Get message history with a specific partner
exports.getMessages = async (req, res) => {
    try {
        const userId = req.user.id;
        const { partnerId } = req.params;

        // Retrieve messages between the two users
        const messages = await DirectMessage.find({
            $or: [
                { sender: userId, receiver: partnerId },
                { sender: partnerId, receiver: userId }
            ]
        }).sort({ createdAt: 1 });

        // Mark incoming messages from partner as read
        await DirectMessage.updateMany(
            { sender: partnerId, receiver: userId, isRead: false },
            { $set: { isRead: true } }
        );

        res.status(200).json(messages);
    } catch (error) {
        console.error("getMessages error:", error);
        res.status(500).json({ message: "Failed to fetch message history", error: error.message });
    }
};

// Send a direct message to a partner
exports.sendMessage = async (req, res) => {
    try {
        const userId = req.user.id;
        const { partnerId } = req.params;
        const { text } = req.body;

        if (!text || !text.trim()) {
            return res.status(400).json({ message: "Message content cannot be empty" });
        }

        const newMsg = new DirectMessage({
            sender: userId,
            receiver: partnerId,
            text: text.trim()
        });

        await newMsg.save();

        // Also trigger a system notification for the receiver
        try {
            const Notification = require("../models/Notification");
            const senderUser = await User.findById(userId).select("name");
            const notif = new Notification({
                recipient: partnerId,
                title: "New Message",
                message: `${senderUser ? senderUser.name : "Someone"} sent you a message: "${text.substring(0, 30)}${text.length > 30 ? '...' : ''}"`,
                link: req.user.role === 'teacher' ? "/student-dashboard" : "/instructor-dashboard",
                isRead: false
            });
            await notif.save();
        } catch (e) {
            console.error("Failed to save notification for direct message:", e);
        }

        res.status(201).json(newMsg);
    } catch (error) {
        console.error("sendMessage error:", error);
        res.status(500).json({ message: "Failed to deliver message", error: error.message });
    }
};
