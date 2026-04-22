const mongoose = require("mongoose");

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true
    },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true
    },
    passwordHash: {
      type: String,
      required: true
    },
    googleId: {
      type: String,
      unique: true,
      sparse: true
    },
    authProvider: {
      type: String,
      enum: ["local", "google"],
      default: "local"
    },
    role: {
      type: String,
      enum: ["student", "teacher"],
      default: "student"
    },
    isVerified: {
      type: Boolean,
      default: false
    },
    verificationCode: {
      type: String
    },
    verificationCodeExpires: {
      type: Date
    },
    resetCode: {
      type: String
    },
    resetCodeExpires: {
      type: Date
    }
  },
  { timestamps: true }
);

module.exports = mongoose.model("User", userSchema);
