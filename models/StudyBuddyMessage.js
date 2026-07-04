const mongoose = require("mongoose");

const studyBuddyMessageSchema = new mongoose.Schema(
    {
        roomId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "StudyBuddyRoom",
            required: true,
        },
        sender: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
        },
        text: {
            type: String,
            required: true,
            trim: true
        }
    },
    { timestamps: true }
);

module.exports = mongoose.model("StudyBuddyMessage", studyBuddyMessageSchema);
