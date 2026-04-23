const User = require("../models/User");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const { OAuth2Client } = require("google-auth-library");
const axios = require("axios");
const { sendVerificationEmail, sendPasswordResetEmail } = require("../config/emailService");

const googleClient = new OAuth2Client();

const createJwtToken = (user) => {
  return jwt.sign(
    { id: user._id, role: user.role, name: user.name },
    process.env.JWT_SECRET,
    { expiresIn: "2h" }
  );
};

const normalizeRole = (role) => {
  return role === "teacher" ? "teacher" : "student";
};

const getRoleMismatchMessage = (registeredRole) => {
  if (registeredRole === "teacher") {
    return 'This account is registered as a Teacher. Please use "Login as Teacher" option.';
  }
  return 'This account is registered as a Student. Please use "Login as Student" option.';
};

/**
 * Generate a 6-digit numeric verification code
 */
const generateVerificationCode = () => {
  return crypto.randomInt(100000, 999999).toString();
};

// REGISTER USER (Step 1 — sends verification code)
exports.registerUser = async (req, res) => {
  try {
    const { name, email, password, role } = req.body;
    const normalizedEmail = email?.trim().toLowerCase();
    const normalizedRole = normalizeRole(role);

    if (!normalizedEmail) {
      return res.status(400).json({ msg: "Email is required" });
    }

    if (!name || !name.trim()) {
      return res.status(400).json({ msg: "Name is required" });
    }

    if (!password || password.length < 6) {
      return res.status(400).json({ msg: "Password must be at least 6 characters" });
    }

    console.log("Register Request:", req.body);

    // Check existing user
    const existingUser = await User.findOne({ email: normalizedEmail });

    if (existingUser) {
      // If user exists but is NOT verified, allow re-registration (update their data)
      if (existingUser.isVerified === false) {
        const hash = await bcrypt.hash(password, 10);
        const code = generateVerificationCode();
        const hashedCode = await bcrypt.hash(code, 10);

        existingUser.name = name;
        existingUser.passwordHash = hash;
        existingUser.role = normalizedRole;
        existingUser.verificationCode = hashedCode;
        existingUser.verificationCodeExpires = new Date(Date.now() + 10 * 60 * 1000); // 10 min

        await existingUser.save();

        // Send verification email
        try {
          await sendVerificationEmail(normalizedEmail, code, name);
        } catch (emailErr) {
          console.error("Email send error:", emailErr.message);
          return res.status(500).json({ msg: "Failed to send verification email. Please try again." });
        }

        return res.status(200).json({
          msg: "Verification code sent to your email",
          email: normalizedEmail,
          requiresVerification: true
        });
      }

      return res.status(400).json({ msg: "Email already exists" });
    }

    // Hash password
    const hash = await bcrypt.hash(password, 10);

    // Generate verification code
    const code = generateVerificationCode();
    const hashedCode = await bcrypt.hash(code, 10);

    // Create user with isVerified: false
    const newUser = await User.create({
      name,
      email: normalizedEmail,
      passwordHash: hash,
      role: normalizedRole,
      authProvider: "local",
      isVerified: false,
      verificationCode: hashedCode,
      verificationCodeExpires: new Date(Date.now() + 10 * 60 * 1000) // 10 min
    });

    // Send verification email
    try {
      await sendVerificationEmail(normalizedEmail, code, name);
    } catch (emailErr) {
      console.error("Email send error:", emailErr.message);
      // Clean up the user if email fails
      await User.deleteOne({ _id: newUser._id });
      return res.status(500).json({ msg: "Failed to send verification email. Please try again." });
    }

    res.status(201).json({
      msg: "Verification code sent to your email",
      email: normalizedEmail,
      requiresVerification: true
    });

  } catch (error) {
    console.log(error);
    res.status(500).json({ msg: "Server error" });
  }
};

// VERIFY REGISTRATION CODE (Step 2)
exports.verifyRegistration = async (req, res) => {
  try {
    const { email, code } = req.body;
    const normalizedEmail = email?.trim().toLowerCase();

    if (!normalizedEmail || !code) {
      return res.status(400).json({ msg: "Email and verification code are required" });
    }

    const user = await User.findOne({ email: normalizedEmail, isVerified: false });

    if (!user) {
      return res.status(400).json({ msg: "No pending verification found for this email" });
    }

    // Check if code has expired
    if (!user.verificationCodeExpires || user.verificationCodeExpires < new Date()) {
      return res.status(400).json({ msg: "Verification code has expired. Please request a new one." });
    }

    // Compare the code
    const isMatch = await bcrypt.compare(code, user.verificationCode);
    if (!isMatch) {
      return res.status(400).json({ msg: "Invalid verification code" });
    }

    // Mark as verified and clear code fields
    user.isVerified = true;
    user.verificationCode = undefined;
    user.verificationCodeExpires = undefined;
    await user.save();

    res.json({ msg: "Email verified successfully! You can now log in." });

  } catch (error) {
    console.log(error);
    res.status(500).json({ msg: "Server error" });
  }
};

// RESEND VERIFICATION CODE
exports.resendVerificationCode = async (req, res) => {
  try {
    const { email } = req.body;
    const normalizedEmail = email?.trim().toLowerCase();

    if (!normalizedEmail) {
      return res.status(400).json({ msg: "Email is required" });
    }

    const user = await User.findOne({ email: normalizedEmail, isVerified: false });

    if (!user) {
      return res.status(400).json({ msg: "No pending verification found for this email" });
    }

    // Rate limit: check if last code was sent less than 60 seconds ago
    if (user.verificationCodeExpires) {
      const codeCreatedAt = new Date(user.verificationCodeExpires.getTime() - 10 * 60 * 1000);
      const secondsSinceLastSend = (Date.now() - codeCreatedAt.getTime()) / 1000;
      if (secondsSinceLastSend < 60) {
        const waitSeconds = Math.ceil(60 - secondsSinceLastSend);
        return res.status(429).json({
          msg: `Please wait ${waitSeconds} seconds before requesting a new code`,
          retryAfter: waitSeconds
        });
      }
    }

    // Generate new code
    const code = generateVerificationCode();
    const hashedCode = await bcrypt.hash(code, 10);

    user.verificationCode = hashedCode;
    user.verificationCodeExpires = new Date(Date.now() + 10 * 60 * 1000);
    await user.save();

    // Send email
    try {
      await sendVerificationEmail(normalizedEmail, code, user.name);
    } catch (emailErr) {
      console.error("Email resend error:", emailErr.message);
      return res.status(500).json({ msg: "Failed to resend verification email. Please try again." });
    }

    res.json({ msg: "New verification code sent to your email" });

  } catch (error) {
    console.log(error);
    res.status(500).json({ msg: "Server error" });
  }
};

// LOGIN USER
exports.loginUser = async (req, res) => {
  try {
    const { email, password } = req.body;
    const normalizedEmail = email?.trim().toLowerCase();

    if (!normalizedEmail || !password) {
      return res.status(400).json({ msg: "Email and password are required" });
    }

    console.log("Login Request:", req.body);

    // check user
    const user = await User.findOne({ email: normalizedEmail });
    if (!user) return res.status(400).json({ msg: "User not found" });

    // Check if user is verified (treat undefined/null as verified for backwards compat)
    if (user.isVerified === false) {
      return res.status(403).json({
        msg: "Please verify your email first. Check your inbox for the verification code.",
        requiresVerification: true,
        email: normalizedEmail
      });
    }

    if (user.authProvider === "google") {
      return res.status(400).json({ msg: "This account uses Google Sign-In. Please continue with Google." });
    }

    if (!user.passwordHash) {
      return res.status(400).json({ msg: "Password login is not available for this account." });
    }

    const isMatch = await bcrypt.compare(password, user.passwordHash);
    if (!isMatch) return res.status(400).json({ msg: "Incorrect Password" });

    // jwt token
    const token = createJwtToken(user);

    res.json({ token, id: user._id, role: user.role, name: user.name });

  } catch (error) {
    console.log(error);
    res.status(500).json({ msg: "Server error" });
  }
};

// LOGIN/REGISTER USER WITH GOOGLE
exports.loginWithGoogle = async (req, res) => {
  try {
    const { idToken, role } = req.body;

    if (!idToken) {
      return res.status(400).json({ msg: "Google token is required" });
    }

    if (!process.env.GOOGLE_CLIENT_ID) {
      return res.status(500).json({ msg: "Google auth is not configured on the server" });
    }

    let payload;
    
    // Try verifying as ID Token first
    try {
      const ticket = await googleClient.verifyIdToken({
        idToken,
        audience: process.env.GOOGLE_CLIENT_ID
      });
      payload = ticket.getPayload();
    } catch (verifyError) {
      // If ID Token verification fails, assume it's an Access Token and fetch UserInfo
      try {
        const googleResponse = await axios.get(`https://www.googleapis.com/oauth2/v3/userinfo`, {
          headers: { Authorization: `Bearer ${idToken}` }
        });
        payload = googleResponse.data;
        // Map fields to match ticket.getPayload() structure
        payload.sub = payload.sub || payload.id;
      } catch (axiosError) {
        console.error("Google token verification failed:", verifyError.message, axiosError.message);
        return res.status(400).json({ msg: "Invalid Google token (neither ID nor Access token)" });
      }
    }

    if (!payload?.email || !payload?.sub) {
      return res.status(400).json({ msg: "Invalid Google account data" });
    }

    const normalizedEmail = payload.email.trim().toLowerCase();
    const requestedRole = role ? normalizeRole(role) : null;
    let user = await User.findOne({ email: normalizedEmail });

    if (!user) {
      const generatedPasswordHash = await bcrypt.hash(`${payload.sub}:${Date.now()}`, 10);
      const assignedRole = requestedRole || "student";

      user = await User.create({
        name: payload.name || normalizedEmail.split("@")[0],
        email: normalizedEmail,
        passwordHash: generatedPasswordHash,
        role: assignedRole,
        googleId: payload.sub,
        authProvider: "google",
        isVerified: true // Google users are auto-verified
      });
    } else {
      if (requestedRole && user.role !== requestedRole) {
        return res.status(400).json({ msg: getRoleMismatchMessage(user.role) });
      }

      if (user.googleId && user.googleId !== payload.sub) {
        return res.status(400).json({ msg: "Google account does not match this email" });
      }

      if (!user.googleId) {
        user.googleId = payload.sub;
      }

      if (!user.name && payload.name) {
        user.name = payload.name;
      }

      if (!user.authProvider) {
        user.authProvider = "local";
      }

      // Auto-verify Google users
      if (user.isVerified === false) {
        user.isVerified = true;
        user.verificationCode = undefined;
        user.verificationCodeExpires = undefined;
      }

      await user.save();
    }

    const token = createJwtToken(user);
    res.json({ token, id: user._id, role: user.role, name: user.name });
  } catch (error) {
    console.error("Google login error:", error.message);
    res.status(500).json({ msg: "Google login failed" });
  }
};

// FORGOT PASSWORD — sends reset code
exports.forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;
    const normalizedEmail = email?.trim().toLowerCase();

    if (!normalizedEmail) {
      return res.status(400).json({ msg: "Email is required" });
    }

    const user = await User.findOne({ email: normalizedEmail });

    if (!user) {
      // Don't reveal if email exists or not for security
      return res.json({ msg: "If this email is registered, you will receive a reset code." });
    }

    if (user.authProvider === "google") {
      return res.status(400).json({ msg: "This account uses Google Sign-In. Password reset is not available." });
    }

    // Rate limit: check if last code was sent less than 60 seconds ago
    if (user.resetCodeExpires) {
      const codeCreatedAt = new Date(user.resetCodeExpires.getTime() - 10 * 60 * 1000);
      const secondsSinceLastSend = (Date.now() - codeCreatedAt.getTime()) / 1000;
      if (secondsSinceLastSend < 60) {
        const waitSeconds = Math.ceil(60 - secondsSinceLastSend);
        return res.status(429).json({
          msg: `Please wait ${waitSeconds} seconds before requesting a new code`,
          retryAfter: waitSeconds
        });
      }
    }

    // Generate reset code
    const code = generateVerificationCode();
    const hashedCode = await bcrypt.hash(code, 10);

    user.resetCode = hashedCode;
    user.resetCodeExpires = new Date(Date.now() + 10 * 60 * 1000); // 10 min
    await user.save();

    // Send email
    try {
      await sendPasswordResetEmail(normalizedEmail, code, user.name);
    } catch (emailErr) {
      console.error("Reset email error:", emailErr.message);
      return res.status(500).json({ msg: "Failed to send reset email. Please try again." });
    }

    res.json({ msg: "Password reset code sent to your email", email: normalizedEmail });

  } catch (error) {
    console.log(error);
    res.status(500).json({ msg: "Server error" });
  }
};

// VERIFY RESET CODE
exports.verifyResetCode = async (req, res) => {
  try {
    const { email, code } = req.body;
    const normalizedEmail = email?.trim().toLowerCase();

    if (!normalizedEmail || !code) {
      return res.status(400).json({ msg: "Email and reset code are required" });
    }

    const user = await User.findOne({ email: normalizedEmail });

    if (!user || !user.resetCode) {
      return res.status(400).json({ msg: "No password reset request found for this email" });
    }

    // Check if code has expired
    if (!user.resetCodeExpires || user.resetCodeExpires < new Date()) {
      return res.status(400).json({ msg: "Reset code has expired. Please request a new one." });
    }

    // Compare the code
    const isMatch = await bcrypt.compare(code, user.resetCode);
    if (!isMatch) {
      return res.status(400).json({ msg: "Invalid reset code" });
    }

    res.json({ msg: "Code verified. You can now set a new password.", verified: true });

  } catch (error) {
    console.log(error);
    res.status(500).json({ msg: "Server error" });
  }
};

// RESET PASSWORD (after code is verified)
exports.resetPassword = async (req, res) => {
  try {
    const { email, code, newPassword } = req.body;
    const normalizedEmail = email?.trim().toLowerCase();

    if (!normalizedEmail || !code || !newPassword) {
      return res.status(400).json({ msg: "Email, code, and new password are required" });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({ msg: "Password must be at least 6 characters" });
    }

    const user = await User.findOne({ email: normalizedEmail });

    if (!user || !user.resetCode) {
      return res.status(400).json({ msg: "No password reset request found" });
    }

    // Check expiry
    if (!user.resetCodeExpires || user.resetCodeExpires < new Date()) {
      return res.status(400).json({ msg: "Reset code has expired. Please request a new one." });
    }

    // Verify code again for security
    const isMatch = await bcrypt.compare(code, user.resetCode);
    if (!isMatch) {
      return res.status(400).json({ msg: "Invalid reset code" });
    }

    // Hash new password and save
    user.passwordHash = await bcrypt.hash(newPassword, 10);
    user.resetCode = undefined;
    user.resetCodeExpires = undefined;
    await user.save();

    res.json({ msg: "Password reset successfully! You can now log in with your new password." });

  } catch (error) {
    console.log(error);
    res.status(500).json({ msg: "Server error" });
  }
};
