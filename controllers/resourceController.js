const Resource = require("../models/Resource");
const User = require("../models/User");

// @desc    Create a new study resource/book
// @route   POST /api/resources
// @access  Private
const createResource = async (req, res) => {
    try {
        const { title, description, fileData, category, metadata } = req.body;
        const uploaderId = req.user.id;

        if (!title || !description || !fileData || !category) {
            return res.status(400).json({ message: "All required fields (title, description, file data, category) must be provided." });
        }

        const newResource = await Resource.create({
            title,
            description,
            fileData,
            category,
            uploader: uploaderId,
            metadata: metadata || {}
        });

        const populated = await Resource.findById(newResource._id).populate("uploader", "name email role avatar");
        res.status(201).json(populated);
    } catch (error) {
        console.error("Error creating resource:", error);
        res.status(500).json({ message: "Server Error", error: error.message });
    }
};

// @desc    Get all resources with optional search and category filters
// @route   GET /api/resources
// @access  Private
const getResources = async (req, res) => {
    try {
        const { search, category, uploader } = req.query;
        const filter = {};

        if (uploader) {
            filter.uploader = uploader;
        }

        if (category && category !== "all") {
            filter.category = category;
        }

        if (search && search.trim()) {
            const searchRegex = new RegExp(search.trim(), "i");
            filter.$or = [
                { title: searchRegex },
                { description: searchRegex },
                { category: searchRegex },
                { "metadata.author": searchRegex },
                { "metadata.publisher": searchRegex },
                { "metadata.isbn": searchRegex }
            ];
        }

        const resources = await Resource.find(filter)
            .populate("uploader", "name email role avatar")
            .populate("reviews.user", "name role avatar")
            .sort({ createdAt: -1 });

        res.status(200).json(resources);
    } catch (error) {
        console.error("Error fetching resources:", error);
        res.status(500).json({ message: "Server Error", error: error.message });
    }
};

// @desc    Get single resource by ID
// @route   GET /api/resources/:id
// @access  Private
const getResourceById = async (req, res) => {
    try {
        const resource = await Resource.findById(req.params.id)
            .populate("uploader", "name email role avatar")
            .populate("reviews.user", "name role avatar");

        if (!resource) {
            return res.status(404).json({ message: "Resource not found" });
        }

        res.status(200).json(resource);
    } catch (error) {
        console.error("Error fetching resource details:", error);
        res.status(500).json({ message: "Server Error", error: error.message });
    }
};

// @desc    Delete a resource
// @route   DELETE /api/resources/:id
// @access  Private
const deleteResource = async (req, res) => {
    try {
        const resource = await Resource.findById(req.params.id);
        const userId = req.user.id;

        if (!resource) {
            return res.status(404).json({ message: "Resource not found" });
        }

        // Check ownership or if admin
        if (resource.uploader.toString() !== userId && req.user.role !== "admin") {
            return res.status(403).json({ message: "Not authorized to delete this resource." });
        }

        await Resource.findByIdAndDelete(req.params.id);
        res.status(200).json({ message: "Resource deleted successfully" });
    } catch (error) {
        console.error("Error deleting resource:", error);
        res.status(500).json({ message: "Server Error", error: error.message });
    }
};

// @desc    Increment downloads counter for a resource
// @route   POST /api/resources/:id/download
// @access  Private
const downloadResource = async (req, res) => {
    try {
        const resource = await Resource.findByIdAndUpdate(
            req.params.id,
            { $inc: { downloadsCount: 1 } },
            { new: true }
        ).populate("uploader", "name email role avatar");

        if (!resource) {
            return res.status(404).json({ message: "Resource not found" });
        }

        res.status(200).json(resource);
    } catch (error) {
        console.error("Error updating download count:", error);
        res.status(500).json({ message: "Server Error", error: error.message });
    }
};

// @desc    Add a review/comment to a resource
// @route   POST /api/resources/:id/reviews
// @access  Private
const addReview = async (req, res) => {
    try {
        const { rating, comment } = req.body;
        const userId = req.user.id;

        if (!comment || !comment.trim()) {
            return res.status(400).json({ message: "Comment is required" });
        }

        const resource = await Resource.findById(req.params.id);
        if (!resource) {
            return res.status(404).json({ message: "Resource not found" });
        }

        // Find the user to get their name
        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({ message: "User not found" });
        }

        const newReview = {
            user: userId,
            userName: user.name,
            rating: Number(rating) || 5,
            comment: comment.trim()
        };

        resource.reviews.push(newReview);
        await resource.save();

        const updatedResource = await Resource.findById(req.params.id)
            .populate("uploader", "name email role avatar")
            .populate("reviews.user", "name role avatar");

        res.status(201).json(updatedResource);
    } catch (error) {
        console.error("Error adding review:", error);
        res.status(500).json({ message: "Server Error", error: error.message });
    }
};

// @desc    Delete a review/comment from a resource
// @route   DELETE /api/resources/:id/reviews/:reviewId
// @access  Private
const deleteReview = async (req, res) => {
    try {
        const resource = await Resource.findById(req.params.id);
        const userId = req.user.id;
        const { reviewId } = req.params;

        if (!resource) {
            return res.status(404).json({ message: "Resource not found" });
        }

        const review = resource.reviews.id(reviewId);
        if (!review) {
            return res.status(404).json({ message: "Review not found" });
        }

        // Only allow review author, resource uploader or admin to delete
        if (review.user.toString() !== userId && resource.uploader.toString() !== userId && req.user.role !== "admin") {
            return res.status(403).json({ message: "Not authorized to delete this review." });
        }

        resource.reviews.pull(reviewId);
        await resource.save();

        const updatedResource = await Resource.findById(req.params.id)
            .populate("uploader", "name email role avatar")
            .populate("reviews.user", "name role avatar");

        res.status(200).json(updatedResource);
    } catch (error) {
        console.error("Error deleting review:", error);
        res.status(500).json({ message: "Server Error", error: error.message });
    }
};

module.exports = {
    createResource,
    getResources,
    getResourceById,
    deleteResource,
    downloadResource,
    addReview,
    deleteReview
};
