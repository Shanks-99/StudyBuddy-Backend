const express = require("express");
const router = express.Router();
const authMiddleware = require("../middleware/authMiddleware");
const adminController = require("../controllers/adminController");

// Admin-only middleware
const adminOnly = (req, res, next) => {
    if (req.user?.role !== "admin") {
        return res.status(403).json({ msg: "Admin access required" });
    }
    next();
};

// Dashboard
router.get("/dashboard", authMiddleware, adminOnly, adminController.getDashboardStats);

// Students
router.get("/students", authMiddleware, adminOnly, adminController.getAllStudents);

// Mentors
router.get("/mentors", authMiddleware, adminOnly, adminController.getAllMentors);

// Approvals
router.get("/approvals", authMiddleware, adminOnly, adminController.getPendingApprovals);
router.put("/approvals/:profileId", authMiddleware, adminOnly, adminController.updateMentorStatus);

// Reports
router.get("/reports", authMiddleware, adminOnly, adminController.getAllReports);
router.put("/reports/:reportId", authMiddleware, adminOnly, adminController.updateReportStatus);

// Any user can submit a report
router.post("/reports", authMiddleware, adminController.submitReport);

// User actions (ban/delete)
router.put("/users/:id/toggle-ban", authMiddleware, adminOnly, adminController.toggleUserBan);
router.delete("/users/:id", authMiddleware, adminOnly, adminController.deleteUser);

// Analytics
router.get("/analytics", authMiddleware, adminOnly, adminController.getAnalytics);

module.exports = router;
