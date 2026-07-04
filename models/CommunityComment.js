const mongoose = require("mongoose");

const communityCommentSchema = new mongoose.Schema(
    {
        postId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "CommunityPost",
            required: true,
        },
        author: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
        },
        text: {
            type: String,
            required: true,
            trim: true,
        },
    },
    { timestamps: true }
);

module.exports = mongoose.model("CommunityComment", communityCommentSchema);
