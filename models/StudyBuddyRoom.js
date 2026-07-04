const mongoose = require("mongoose");

const studyBuddyRoomSchema = new mongoose.Schema(
    {
        name: {
            type: String,
            required: true,
            trim: true
        },
        description: {
            type: String,
            trim: true
        },
        subject: {
            type: String,
            required: true,
            trim: true
        },
        host: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
        },
        buddy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            default: null
        },
        status: {
            type: String,
            enum: ["waiting", "active", "completed"],
            default: "waiting"
        },
        isPrivate: {
            type: Boolean,
            default: false
        },
        passcode: {
            type: String,
            default: null
        },
        notes: {
            type: String,
            default: ""
        },
        todos: [
            {
                id: { type: String, required: true },
                text: { type: String, required: true },
                done: { type: Boolean, default: false }
            }
        ]
    },
    { timestamps: true }
);

module.exports = mongoose.model("StudyBuddyRoom", studyBuddyRoomSchema);
