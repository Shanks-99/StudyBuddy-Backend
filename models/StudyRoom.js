const mongoose = require("mongoose");

const studyRoomSchema = new mongoose.Schema(
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
        createdBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
        },
        maxParticipants: {
            type: Number,
            default: 10
        },
        isPrivate: {
            type: Boolean,
            default: false
        },
        customRoomId: {
            type: String,
            trim: true,
            default: null
        },
        passcode: {
            type: String,
            trim: true,
            default: null
        }
    },
    { timestamps: true }
);

module.exports = mongoose.model("StudyRoom", studyRoomSchema);
