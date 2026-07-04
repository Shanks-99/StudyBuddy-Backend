const express = require("express");
const router = express.Router();
const authMiddleware = require("../middleware/authMiddleware");
const {
    createResource,
    getResources,
    getResourceById,
    deleteResource,
    downloadResource,
    addReview,
    deleteReview
} = require("../controllers/resourceController");

// All endpoints require authentication
router.post("/", authMiddleware, createResource);
router.get("/", authMiddleware, getResources);
router.get("/:id", authMiddleware, getResourceById);
router.delete("/:id", authMiddleware, deleteResource);
router.post("/:id/download", authMiddleware, downloadResource);
router.post("/:id/reviews", authMiddleware, addReview);
router.delete("/:id/reviews/:reviewId", authMiddleware, deleteReview);

module.exports = router;
