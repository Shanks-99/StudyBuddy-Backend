const express = require("express");
const { 
  registerUser, 
  loginUser, 
  loginWithGoogle, 
  verifyRegistration, 
  resendVerificationCode, 
  forgotPassword, 
  verifyResetCode, 
  resetPassword,
  getProfile,
  updateProfile,
  changePassword,
  deleteAccount
} = require("../controllers/authController");
const authMiddleware = require("../middleware/authMiddleware");
const router = express.Router();

router.post("/register", registerUser);
router.post("/login", loginUser);
router.post("/google", loginWithGoogle);
router.post("/verify-code", verifyRegistration);
router.post("/resend-code", resendVerificationCode);
router.post("/forgot-password", forgotPassword);
router.post("/verify-reset-code", verifyResetCode);
router.post("/reset-password", resetPassword);

// Profile routes
router.get("/profile", authMiddleware, getProfile);
router.put("/profile", authMiddleware, updateProfile);
router.put("/change-password", authMiddleware, changePassword);
router.delete("/delete-account", authMiddleware, deleteAccount);

module.exports = router;
