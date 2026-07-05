const mongoose = require("mongoose");

const participantSchema = new mongoose.Schema(
    {
        student: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
        },
        studentName: {
            type: String,
            required: true,
            trim: true,
        },
        paymentStatus: {
            type: String,
            enum: ["pending", "accepted", "sent", "verified", "rejected"],
            default: "pending",
        },
        joinedAt: {
            type: Date,
            default: Date.now,
        },
    },
    { _id: true }
);

const groupSessionSchema = new mongoose.Schema(
    {
        mentor: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
        },
        createdBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
        },
        mentorName: {
            type: String,
            required: true,
            trim: true,
        },
        topic: {
            type: String,
            required: true,
            trim: true,
        },
        description: {
            type: String,
            required: true,
            trim: true,
        },
        dateLabel: {
            type: String,
            required: true,
            trim: true,
        },
        timeSlot: {
            type: String,
            required: true,
            trim: true,
        },
        maxParticipants: {
            type: Number,
            default: 10,
            min: 2,
        },
        rate: {
            type: Number,
            required: true,
        },
        status: {
            type: String,
            enum: [
                "pending",
                "accepted",
                "declined",
                "scheduled",
                "completed",
                "cancelled",
            ],
            default: "pending",
        },
        communityPostId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "CommunityPost",
            default: null,
        },
        participants: {
            type: [participantSchema],
            default: [],
        },
    },
    { timestamps: true }
);

module.exports = mongoose.model("GroupSession", groupSessionSchema);
