const mongoose = require("mongoose");

const reportSchema = new mongoose.Schema(
    {
        reporter: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
        },
        reportedUser: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
        },
        reason: {
            type: String,
            required: true,
            trim: true,
        },
        description: {
            type: String,
            default: "",
            trim: true,
        },
        category: {
            type: String,
            enum: ["harassment", "spam", "inappropriate", "fraud", "other"],
            default: "other",
        },
        status: {
            type: String,
            enum: ["pending", "reviewed", "resolved", "dismissed"],
            default: "pending",
        },
        adminNotes: {
            type: String,
            default: "",
        },
        resolvedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
        },
        resolvedAt: {
            type: Date,
        },
    },
    { timestamps: true }
);

module.exports = mongoose.model("Report", reportSchema);
