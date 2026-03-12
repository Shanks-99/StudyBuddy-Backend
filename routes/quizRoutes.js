const express = require("express");
const {
    generateQuiz,
    createQuiz,
    getQuizzes,
    getQuizById,
    updateQuiz,
    deleteQuiz,
} = require("../controllers/quizController");
const router = express.Router();

// Middleware to verify JWT token
const jwt = require("jsonwebtoken");

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

// All routes require authentication
router.post("/generate", authMiddleware, generateQuiz);
router.post("/create", authMiddleware, createQuiz);
router.get("/all", authMiddleware, getQuizzes);
router.get("/:id", authMiddleware, getQuizById);
router.put("/:id", authMiddleware, updateQuiz);
router.delete("/:id", authMiddleware, deleteQuiz);

module.exports = router;
