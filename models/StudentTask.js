const mongoose = require("mongoose");

const studentTaskSchema = new mongoose.Schema(
    {
        student: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
        },
        mentor: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
        },
        mentorName: {
            type: String,
            required: true
        },
        title: {
            type: String,
            required: true,
            trim: true,
        },
        description: {
            type: String,
            trim: true,
            default: "",
        },
        status: {
            type: String,
            enum: ["pending", "completed"],
            default: "pending",
        },
    },
    { timestamps: true }
);

module.exports = mongoose.model("StudentTask", studentTaskSchema);
