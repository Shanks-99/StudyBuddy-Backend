const mongoose = require("mongoose");

const mentorshipSessionSchema = new mongoose.Schema(
    {
        mentor: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: false,
        },
        student: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: false,
        },
        mentorName: {
            type: String,
            required: true,
            trim: true,
        },
        studentName: {
            type: String,
            required: true,
            trim: true,
        },
        subject: {
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
        message: {
            type: String,
            trim: true,
            default: "",
        },
        mode: {
            type: String,
            default: "Video",
        },
        status: {
            type: String,
            enum: ["pending", "accepted", "declined", "completed", "cancelled"],
            default: "pending",
        },
    },
    { timestamps: true }
);

module.exports = mongoose.model("MentorshipSession", mentorshipSessionSchema);
