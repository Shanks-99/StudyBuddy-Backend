const express = require("express");
const { registerUser, loginUser, loginWithGoogle, verifyRegistration, resendVerificationCode, forgotPassword, verifyResetCode, resetPassword } = require("../controllers/authController");
const router = express.Router();

router.post("/register", registerUser);
router.post("/login", loginUser);
router.post("/google", loginWithGoogle);
router.post("/verify-code", verifyRegistration);
router.post("/resend-code", resendVerificationCode);
router.post("/forgot-password", forgotPassword);
router.post("/verify-reset-code", verifyResetCode);
router.post("/reset-password", resetPassword);

module.exports = router;
