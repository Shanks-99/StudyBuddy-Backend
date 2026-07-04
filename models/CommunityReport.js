const mongoose = require("mongoose");

const communityReportSchema = new mongoose.Schema(
    {
        postId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "CommunityPost",
            required: true,
        },
        reportedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
        },
        reason: {
            type: String,
            required: true,
            trim: true,
        },
        status: {
            type: String,
            enum: ["pending", "reviewed", "dismissed"],
            default: "pending",
        },
    },
    { timestamps: true }
);

module.exports = mongoose.model("CommunityReport", communityReportSchema);
