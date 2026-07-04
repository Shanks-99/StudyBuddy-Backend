const mongoose = require("mongoose");

const resourceSchema = new mongoose.Schema(
    {
        title: {
            type: String,
            required: true,
            trim: true
        },
        description: {
            type: String,
            required: true,
            trim: true
        },
        // File data stored as: filename|DATA|base64_data
        fileData: {
            type: String,
            required: true
        },
        category: {
            type: String,
            required: true,
            trim: true
        },
        uploader: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true
        },
        // Optional book metadata
        metadata: {
            author: { type: String, default: "" },
            publisher: { type: String, default: "" },
            publishYear: { type: String, default: "" },
            isbn: { type: String, default: "" },
            edition: { type: String, default: "" },
            pageCount: { type: String, default: "" }
        },
        reviews: [
            {
                user: {
                    type: mongoose.Schema.Types.ObjectId,
                    ref: "User",
                    required: true
                },
                userName: { type: String, required: true },
                rating: { type: Number, min: 1, max: 5, default: 5 },
                comment: { type: String, required: true },
                createdAt: { type: Date, default: Date.now }
            }
        ],
        downloadsCount: {
            type: Number,
            default: 0
        }
    },
    { timestamps: true }
);

module.exports = mongoose.model("Resource", resourceSchema);
