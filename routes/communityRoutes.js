const express = require("express");
const router = express.Router();
const {
    createPost,
    getPosts,
    getPostById,
    deletePost,
    toggleLike,
    addComment,
    getComments,
    deleteComment,
    reportPost,
    getReports,
    handleReport,
    getTrending,
} = require("../controllers/communityController");

// Posts
router.post("/posts", createPost);
router.get("/posts", getPosts);
router.get("/trending", getTrending);
router.get("/posts/:postId", getPostById);
router.delete("/posts/:postId", deletePost);

// Likes
router.put("/posts/:postId/like", toggleLike);

// Comments
router.post("/posts/:postId/comments", addComment);
router.get("/posts/:postId/comments", getComments);
router.delete("/comments/:commentId", deleteComment);

// Reports
router.post("/posts/:postId/report", reportPost);
router.get("/reports", getReports);
router.put("/reports/:reportId", handleReport);

module.exports = router;
