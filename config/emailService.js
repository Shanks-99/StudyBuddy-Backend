const nodemailer = require("nodemailer");

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

/**
 * Send a verification code email to the user
 * @param {string} toEmail - Recipient email address
 * @param {string} code - 6-digit verification code
 * @param {string} name - User's name for personalization
 */
const sendVerificationEmail = async (toEmail, code, name = "there") => {
  const mailOptions = {
    from: `"StudyBuddy" <${process.env.EMAIL_USER}>`,
    to: toEmail,
    subject: "🔐 Your StudyBuddy Verification Code",
    html: `
      <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 480px; margin: 0 auto; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); border-radius: 16px; overflow: hidden;">
        <div style="padding: 32px 24px; text-align: center;">
          <h1 style="color: #ffffff; font-size: 28px; margin: 0 0 8px 0; font-weight: 800;">Study<span style="color: #fbbf24;">Buddy</span></h1>
          <p style="color: rgba(255,255,255,0.85); font-size: 14px; margin: 0;">Your Learning Companion</p>
        </div>
        <div style="background: #ffffff; padding: 32px 24px; border-radius: 16px 16px 0 0;">
          <h2 style="color: #1e293b; font-size: 22px; margin: 0 0 12px 0;">Hi ${name}! 👋</h2>
          <p style="color: #475569; font-size: 15px; line-height: 1.6; margin: 0 0 24px 0;">
            Thanks for signing up! Use the verification code below to complete your registration:
          </p>
          <div style="background: linear-gradient(135deg, #f0f4ff 0%, #f5f0ff 100%); border: 2px dashed #818cf8; border-radius: 12px; padding: 20px; text-align: center; margin: 0 0 24px 0;">
            <p style="color: #6366f1; font-size: 36px; font-weight: 800; letter-spacing: 10px; margin: 0; font-family: 'Courier New', monospace;">${code}</p>
          </div>
          <p style="color: #94a3b8; font-size: 13px; line-height: 1.5; margin: 0 0 8px 0;">
            ⏰ This code expires in <strong>10 minutes</strong>.
          </p>
          <p style="color: #94a3b8; font-size: 13px; line-height: 1.5; margin: 0;">
            If you didn't create an account, you can safely ignore this email.
          </p>
        </div>
        <div style="background: #f8fafc; padding: 16px 24px; text-align: center;">
          <p style="color: #94a3b8; font-size: 12px; margin: 0;">© ${new Date().getFullYear()} StudyBuddy. All rights reserved.</p>
        </div>
      </div>
    `
  };

  await transporter.sendMail(mailOptions);
};

/**
 * Send a password reset code email to the user
 * @param {string} toEmail - Recipient email address
 * @param {string} code - 6-digit reset code
 * @param {string} name - User's name for personalization
 */
const sendPasswordResetEmail = async (toEmail, code, name = "there") => {
  const mailOptions = {
    from: `"StudyBuddy" <${process.env.EMAIL_USER}>`,
    to: toEmail,
    subject: "🔑 Reset Your StudyBuddy Password",
    html: `
      <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 480px; margin: 0 auto; background: linear-gradient(135deg, #f59e0b 0%, #ef4444 100%); border-radius: 16px; overflow: hidden;">
        <div style="padding: 32px 24px; text-align: center;">
          <h1 style="color: #ffffff; font-size: 28px; margin: 0 0 8px 0; font-weight: 800;">Study<span style="color: #fef3c7;">Buddy</span></h1>
          <p style="color: rgba(255,255,255,0.85); font-size: 14px; margin: 0;">Password Reset Request</p>
        </div>
        <div style="background: #ffffff; padding: 32px 24px; border-radius: 16px 16px 0 0;">
          <h2 style="color: #1e293b; font-size: 22px; margin: 0 0 12px 0;">Hi ${name}! 🔐</h2>
          <p style="color: #475569; font-size: 15px; line-height: 1.6; margin: 0 0 24px 0;">
            We received a request to reset your password. Use the code below to set a new password:
          </p>
          <div style="background: linear-gradient(135deg, #fef3c7 0%, #fee2e2 100%); border: 2px dashed #f59e0b; border-radius: 12px; padding: 20px; text-align: center; margin: 0 0 24px 0;">
            <p style="color: #d97706; font-size: 36px; font-weight: 800; letter-spacing: 10px; margin: 0; font-family: 'Courier New', monospace;">${code}</p>
          </div>
          <p style="color: #94a3b8; font-size: 13px; line-height: 1.5; margin: 0 0 8px 0;">
            ⏰ This code expires in <strong>10 minutes</strong>.
          </p>
          <p style="color: #94a3b8; font-size: 13px; line-height: 1.5; margin: 0;">
            If you didn't request a password reset, you can safely ignore this email. Your password will remain unchanged.
          </p>
        </div>
        <div style="background: #f8fafc; padding: 16px 24px; text-align: center;">
          <p style="color: #94a3b8; font-size: 12px; margin: 0;">© ${new Date().getFullYear()} StudyBuddy. All rights reserved.</p>
        </div>
      </div>
    `
  };

  await transporter.sendMail(mailOptions);
};

module.exports = { sendVerificationEmail, sendPasswordResetEmail };
