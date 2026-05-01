const mongoose = require("mongoose");

const mentorProfileSchema = new mongoose.Schema(
    {
        mentor: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
            unique: true,
        },
        name: {
            type: String,
            required: true,
            trim: true,
        },
        email: {
            type: String,
            required: true,
            trim: true,
            lowercase: true,
        },
        specializedCourses: {
            type: String,
            required: true,
            trim: true,
        },
        description: {
            type: String,
            required: true,
            trim: true,
        },
        degreeFiles: {
            type: [String],
            default: [],
        },
        qualification: {
            type: String,
            trim: true,
        },
        skillLevel: {
            type: String,
            enum: ["Beginner", "Intermediate", "Advanced"],
            default: "Beginner",
        },
        tags: {
            type: [String],
            default: [],
        },
        profilePicture: {
            type: String,
            default: "",
        },
        hourlyRate: {
            type: Number,
            default: 0,
        },
        status: {
            type: String,
            enum: ["missing", "pending", "approved", "rejected"],
            default: "pending",
        },
        weeklyAvailability: {
            sun: { type: [String], default: [] },
            mon: { type: [String], default: [] },
            tue: { type: [String], default: [] },
            wed: { type: [String], default: [] },
            thu: { type: [String], default: [] },
            fri: { type: [String], default: [] },
            sat: { type: [String], default: [] },
        },
        submittedAt: {
            type: Date,
            default: Date.now,
        },
    },
    { timestamps: true }
);

module.exports = mongoose.model("MentorProfile", mentorProfileSchema);
