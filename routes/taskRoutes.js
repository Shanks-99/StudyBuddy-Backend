const express = require("express");
const jwt = require("jsonwebtoken");
const { assignTask, getTasks, toggleTaskStatus, deleteTask } = require("../controllers/taskController");

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

router.post("/assign", authMiddleware, assignTask);
router.get("/", authMiddleware, getTasks);
router.patch("/:taskId/toggle", authMiddleware, toggleTaskStatus);
router.delete("/:taskId", authMiddleware, deleteTask);

module.exports = router;
