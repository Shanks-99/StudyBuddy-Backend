// Run: node seedAdmin.js
// Creates an admin user if one doesn't exist already.
const dotenv = require("dotenv");
dotenv.config();
const mongoose = require("mongoose");
const bcrypt = require("bcrypt");
const connectDB = require("./config/db");
const User = require("./models/User");

const ADMIN_EMAIL = "admin@studybuddy.com";
const ADMIN_PASSWORD = "admin123";
const ADMIN_NAME = "Admin";

(async () => {
    await connectDB();

    const existing = await User.findOne({ email: ADMIN_EMAIL });
    if (existing) {
        if (existing.role !== "admin") {
            existing.role = "admin";
            existing.isVerified = true;
            await existing.save();
            console.log("✅ Existing user promoted to admin:", ADMIN_EMAIL);
        } else {
            console.log("ℹ️  Admin already exists:", ADMIN_EMAIL);
        }
    } else {
        const salt = await bcrypt.genSalt(10);
        const passwordHash = await bcrypt.hash(ADMIN_PASSWORD, salt);
        await User.create({
            name: ADMIN_NAME,
            email: ADMIN_EMAIL,
            passwordHash,
            role: "admin",
            isVerified: true,
            authProvider: "local",
        });
        console.log("✅ Admin created:", ADMIN_EMAIL, "/ password:", ADMIN_PASSWORD);
    }

    mongoose.disconnect();
})();
