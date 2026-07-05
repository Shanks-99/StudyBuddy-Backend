const express = require("express");
const jwt = require("jsonwebtoken");
const { getConversations, getMessages, sendMessage } = require("../controllers/directMessageController");

const router = express.Router();

const authMiddleware = (req, res, next) => {
    const token = req.headers.authorization?.split(" ")[1];
    if (!token) return res.status(401).json({ msg: "No token provided" });

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.user = decoded;
        next();
    } catch (error) {
        return res.status(401).json({ msg: "Invalid token" });
    }
};

router.get("/conversations", authMiddleware, getConversations);
router.get("/conversations/:partnerId", authMiddleware, getMessages);
router.post("/conversations/:partnerId", authMiddleware, sendMessage);

module.exports = router;
