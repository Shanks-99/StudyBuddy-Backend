const CommunityPost = require("../models/CommunityPost");
const CommunityComment = require("../models/CommunityComment");
const CommunityReport = require("../models/CommunityReport");
const MentorProfile = require("../models/MentorProfile");

// @desc    Create a new community post
// @route   POST /api/community/posts
const createPost = async (req, res) => {
    try {
        const { userId, content, category } = req.body;

        if (!userId || !content) {
            return res.status(400).json({ message: "User ID and content are required" });
        }

        const newPost = await CommunityPost.create({
            author: userId,
            content,
            category: category || "discussion",
        });

        const populated = await CommunityPost.findById(newPost._id).populate("author", "name role avatar");
        res.status(201).json(populated);
    } catch (error) {
        console.error("Error creating community post:", error);
        res.status(500).json({ message: "Server Error" });
    }
};

// @desc    Get community posts with sorting and filtering
// @route   GET /api/community/posts?sort=latest|likes|comments&category=...&search=...&page=1&limit=20
const getPosts = async (req, res) => {
    try {
        const { sort = "latest", category, search, page = 1, limit = 20 } = req.query;
        const skip = (parseInt(page) - 1) * parseInt(limit);

        const filter = { isHidden: false };
        if (category && category !== "all") {
            filter.category = category;
        }
        if (search && search.trim()) {
            filter.content = { $regex: search.trim(), $options: "i" };
        }

        let sortOption = { createdAt: -1 }; // latest default
        if (sort === "likes") {
            // Sort by likes array length — we use a MongoDB aggregation-compatible approach
            // But for simplicity with populate, we sort after fetching or use a virtual
            sortOption = { createdAt: -1 }; // will re-sort client side or use aggregation
        } else if (sort === "comments") {
            sortOption = { commentCount: -1, createdAt: -1 };
        }

        let posts = await CommunityPost.find(filter)
            .populate("author", "name role avatar")
            .populate("groupSessionRef")
            .sort(sortOption)
            .skip(skip)
            .limit(parseInt(limit));

        // If sorting by likes, sort in memory by likes array length
        if (sort === "likes") {
            posts = posts.sort((a, b) => b.likes.length - a.likes.length);
        }

        // Attach mentor profile payment details to populated group sessions
        const postsWithProfiles = await Promise.all(posts.map(async (post) => {
            const postObj = post.toObject ? post.toObject() : post;
            if (postObj.groupSessionRef) {
                const mentorId = postObj.groupSessionRef.mentor;
                if (mentorId) {
                    const profile = await MentorProfile.findOne({ mentor: mentorId });
                    if (profile) {
                        postObj.groupSessionRef.mentorProfile = {
                            bankAccountNumber: profile.bankAccountNumber || "",
                            easypaisaNumber: profile.easypaisaNumber || ""
                        };
                    }
                }
            }
            return postObj;
        }));

        const total = await CommunityPost.countDocuments(filter);

        res.status(200).json({ posts: postsWithProfiles, total, page: parseInt(page), totalPages: Math.ceil(total / parseInt(limit)) });
    } catch (error) {
        console.error("Error fetching community posts:", error);
        res.status(500).json({ message: "Server Error" });
    }
};

// @desc    Get single post by ID
// @route   GET /api/community/posts/:postId
const getPostById = async (req, res) => {
    try {
        const post = await CommunityPost.findById(req.params.postId)
            .populate("author", "name role avatar")
            .populate("groupSessionRef");
        if (!post) return res.status(404).json({ message: "Post not found" });

        const postObj = post.toObject ? post.toObject() : post;
        if (postObj.groupSessionRef) {
            const mentorId = postObj.groupSessionRef.mentor;
            if (mentorId) {
                const profile = await MentorProfile.findOne({ mentor: mentorId });
                if (profile) {
                    postObj.groupSessionRef.mentorProfile = {
                        bankAccountNumber: profile.bankAccountNumber || "",
                        easypaisaNumber: profile.easypaisaNumber || ""
                    };
                }
            }
        }

        res.status(200).json(postObj);
    } catch (error) {
        console.error("Error fetching post:", error);
        res.status(500).json({ message: "Server Error" });
    }
};

// @desc    Delete a post (author only)
// @route   DELETE /api/community/posts/:postId
const deletePost = async (req, res) => {
    try {
        const { userId } = req.body;
        const post = await CommunityPost.findById(req.params.postId);

        if (!post) return res.status(404).json({ message: "Post not found" });
        if (String(post.author) !== String(userId)) {
            return res.status(403).json({ message: "You can only delete your own posts" });
        }

        // Delete all comments and reports for this post
        await CommunityComment.deleteMany({ postId: post._id });
        await CommunityReport.deleteMany({ postId: post._id });
        await CommunityPost.findByIdAndDelete(post._id);

        res.status(200).json({ message: "Post deleted successfully" });
    } catch (error) {
        console.error("Error deleting post:", error);
        res.status(500).json({ message: "Server Error" });
    }
};

// @desc    Toggle like on a post
// @route   PUT /api/community/posts/:postId/like
const toggleLike = async (req, res) => {
    try {
        const { userId } = req.body;
        const post = await CommunityPost.findById(req.params.postId);

        if (!post) return res.status(404).json({ message: "Post not found" });

        const index = post.likes.indexOf(userId);
        if (index === -1) {
            post.likes.push(userId);
        } else {
            post.likes.splice(index, 1);
        }

        await post.save();

        const updated = await CommunityPost.findById(post._id).populate("author", "name role avatar");
        res.status(200).json(updated);
    } catch (error) {
        console.error("Error toggling like:", error);
        res.status(500).json({ message: "Server Error" });
    }
};

// @desc    Add a comment to a post
// @route   POST /api/community/posts/:postId/comments
const addComment = async (req, res) => {
    try {
        const { userId, text } = req.body;
        const { postId } = req.params;

        if (!userId || !text) {
            return res.status(400).json({ message: "User ID and text are required" });
        }

        const post = await CommunityPost.findById(postId);
        if (!post) return res.status(404).json({ message: "Post not found" });

        const comment = await CommunityComment.create({
            postId,
            author: userId,
            text,
        });

        // Increment denormalized comment count
        post.commentCount = (post.commentCount || 0) + 1;
        await post.save();

        const populated = await CommunityComment.findById(comment._id).populate("author", "name role avatar");
        res.status(201).json(populated);
    } catch (error) {
        console.error("Error adding comment:", error);
        res.status(500).json({ message: "Server Error" });
    }
};

// @desc    Get comments for a post
// @route   GET /api/community/posts/:postId/comments
const getComments = async (req, res) => {
    try {
        const comments = await CommunityComment.find({ postId: req.params.postId })
            .populate("author", "name role avatar")
            .sort({ createdAt: 1 });

        res.status(200).json(comments);
    } catch (error) {
        console.error("Error fetching comments:", error);
        res.status(500).json({ message: "Server Error" });
    }
};

// @desc    Delete a comment (author only)
// @route   DELETE /api/community/comments/:commentId
const deleteComment = async (req, res) => {
    try {
        const { userId } = req.body;
        const comment = await CommunityComment.findById(req.params.commentId);

        if (!comment) return res.status(404).json({ message: "Comment not found" });
        if (String(comment.author) !== String(userId)) {
            return res.status(403).json({ message: "You can only delete your own comments" });
        }

        // Decrement comment count on parent post
        await CommunityPost.findByIdAndUpdate(comment.postId, { $inc: { commentCount: -1 } });
        await CommunityComment.findByIdAndDelete(comment._id);

        res.status(200).json({ message: "Comment deleted" });
    } catch (error) {
        console.error("Error deleting comment:", error);
        res.status(500).json({ message: "Server Error" });
    }
};

// @desc    Report a post to admin
// @route   POST /api/community/posts/:postId/report
const reportPost = async (req, res) => {
    try {
        const { userId, reason } = req.body;
        const { postId } = req.params;

        if (!userId || !reason) {
            return res.status(400).json({ message: "User ID and reason are required" });
        }

        const post = await CommunityPost.findById(postId);
        if (!post) return res.status(404).json({ message: "Post not found" });

        // Prevent duplicate reports from same user on same post
        const existing = await CommunityReport.findOne({ postId, reportedBy: userId });
        if (existing) {
            return res.status(400).json({ message: "You have already reported this post" });
        }

        const report = await CommunityReport.create({
            postId,
            reportedBy: userId,
            reason,
        });

        res.status(201).json({ message: "Report submitted successfully. Our admin team will review it.", report });
    } catch (error) {
        console.error("Error reporting post:", error);
        res.status(500).json({ message: "Server Error" });
    }
};

// @desc    Get all reports (admin only)
// @route   GET /api/community/reports
const getReports = async (req, res) => {
    try {
        const { page = 1, limit = 20 } = req.query;
        const pageNum = Number(page);
        const limitNum = Number(limit);
        const skipNum = (pageNum - 1) * limitNum;

        const total = await CommunityReport.countDocuments();
        const reports = await CommunityReport.find()
            .populate("postId", "content author category")
            .populate("reportedBy", "name email")
            .populate({ path: "postId", populate: { path: "author", select: "name email role" } })
            .sort({ createdAt: -1 })
            .skip(skipNum)
            .limit(limitNum);

        res.status(200).json({
            reports,
            total,
            page: pageNum,
            pages: Math.ceil(total / limitNum)
        });
    } catch (error) {
        console.error("Error fetching reports:", error);
        res.status(500).json({ message: "Server Error" });
    }
};

// @desc    Handle report action (admin: hide post or dismiss)
// @route   PUT /api/community/reports/:reportId
const handleReport = async (req, res) => {
    try {
        const { action } = req.body; // 'hide' or 'dismiss'
        const report = await CommunityReport.findById(req.params.reportId);

        if (!report) return res.status(404).json({ message: "Report not found" });

        if (action === "hide") {
            // Hide the post from the feed
            await CommunityPost.findByIdAndUpdate(report.postId, { isHidden: true });
            report.status = "reviewed";
        } else if (action === "dismiss") {
            report.status = "dismissed";
        }

        await report.save();
        res.status(200).json({ message: `Report ${action === "hide" ? "reviewed — post hidden" : "dismissed"}`, report });
    } catch (error) {
        console.error("Error handling report:", error);
        res.status(500).json({ message: "Server Error" });
    }
};

// @desc    Get trending posts (top 5 most-liked recent posts)
// @route   GET /api/community/trending
const getTrending = async (req, res) => {
    try {
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

        let posts = await CommunityPost.find({
            isHidden: false,
            createdAt: { $gte: sevenDaysAgo },
        })
            .populate("author", "name role avatar")
            .sort({ createdAt: -1 })
            .limit(50); // fetch a batch and sort in memory by likes

        posts.sort((a, b) => b.likes.length - a.likes.length);
        posts = posts.slice(0, 5);

        res.status(200).json(posts);
    } catch (error) {
        console.error("Error fetching trending:", error);
        res.status(500).json({ message: "Server Error" });
    }
};

module.exports = {
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
};
