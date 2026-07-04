const mongoose = require("mongoose");

const communityPostSchema = new mongoose.Schema(
    {
        author: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
        },
        content: {
            type: String,
            required: true,
            trim: true,
        },
        category: {
            type: String,
            enum: ["question", "discussion", "study-tips", "resource", "achievement"],
            default: "discussion",
        },
        likes: [
            {
                type: mongoose.Schema.Types.ObjectId,
                ref: "User",
            },
        ],
        commentCount: {
            type: Number,
            default: 0,
        },
        isHidden: {
            type: Boolean,
            default: false,
        },
    },
    { timestamps: true }
);

module.exports = mongoose.model("CommunityPost", communityPostSchema);
