const User = require("../models/User");
const MentorProfile = require("../models/MentorProfile");
const MentorshipSession = require("../models/MentorshipSession");
const FocusSession = require("../models/FocusSession");
const Report = require("../models/Report");
const StudyRoom = require("../models/StudyRoom");

// ── Dashboard Stats ──
exports.getDashboardStats = async (req, res) => {
    try {
        const [
            totalStudents,
            totalTeachers,
            totalAdmins,
            pendingApprovals,
            pendingReports,
            totalSessions,
            totalRooms,
            recentUsers,
            recentReports,
        ] = await Promise.all([
            User.countDocuments({ role: "student" }),
            User.countDocuments({ role: "teacher" }),
            User.countDocuments({ role: "admin" }),
            MentorProfile.countDocuments({ status: "pending" }),
            Report.countDocuments({ status: "pending" }),
            MentorshipSession.countDocuments({}),
            StudyRoom.countDocuments({}),
            User.find({})
                .sort({ createdAt: -1 })
                .limit(5)
                .select("name email role createdAt avatar isVerified"),
            Report.find({})
                .sort({ createdAt: -1 })
                .limit(5)
                .populate("reporter", "name email")
                .populate("reportedUser", "name email role"),
        ]);

        // Monthly registration data for the last 6 months
        const sixMonthsAgo = new Date();
        sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

        const monthlyRegistrations = await User.aggregate([
            { $match: { createdAt: { $gte: sixMonthsAgo } } },
            {
                $group: {
                    _id: {
                        month: { $month: "$createdAt" },
                        year: { $year: "$createdAt" },
                    },
                    count: { $sum: 1 },
                },
            },
            { $sort: { "_id.year": 1, "_id.month": 1 } },
        ]);

        // Sessions by status
        const sessionsByStatus = await MentorshipSession.aggregate([
            {
                $group: {
                    _id: "$status",
                    count: { $sum: 1 },
                },
            },
        ]);

        res.json({
            stats: {
                totalStudents,
                totalTeachers,
                totalAdmins,
                totalUsers: totalStudents + totalTeachers + totalAdmins,
                pendingApprovals,
                pendingReports,
                totalSessions,
                totalRooms,
            },
            recentUsers,
            recentReports,
            monthlyRegistrations,
            sessionsByStatus,
        });
    } catch (error) {
        console.error("Admin getDashboardStats error:", error);
        res.status(500).json({ msg: "Failed to load dashboard stats" });
    }
};

// ── Student Management ──
exports.getAllStudents = async (req, res) => {
    try {
        const { search, page = 1, limit = 20 } = req.query;
        const query = { role: "student" };

        if (search) {
            query.$or = [
                { name: { $regex: search, $options: "i" } },
                { email: { $regex: search, $options: "i" } },
            ];
        }

        const total = await User.countDocuments(query);
        const students = await User.find(query)
            .select("-passwordHash -verificationCode -resetCode")
            .sort({ createdAt: -1 })
            .skip((page - 1) * limit)
            .limit(Number(limit));

        res.json({ students, total, page: Number(page), pages: Math.ceil(total / limit) });
    } catch (error) {
        console.error("Admin getAllStudents error:", error);
        res.status(500).json({ msg: "Failed to fetch students" });
    }
};

exports.toggleUserBan = async (req, res) => {
    try {
        const user = await User.findById(req.params.id);
        if (!user) return res.status(404).json({ msg: "User not found" });
        if (user.role === "admin") return res.status(403).json({ msg: "Cannot ban an admin" });

        user.isBanned = !user.isBanned;
        await user.save();

        res.json({ msg: `User ${user.isBanned ? "banned" : "unbanned"} successfully`, user });
    } catch (error) {
        console.error("Admin toggleUserBan error:", error);
        res.status(500).json({ msg: "Failed to update user status" });
    }
};

exports.deleteUser = async (req, res) => {
    try {
        const user = await User.findById(req.params.id);
        if (!user) return res.status(404).json({ msg: "User not found" });
        if (user.role === "admin") return res.status(403).json({ msg: "Cannot delete an admin" });

        // Cleanup related data
        if (user.role === "teacher") {
            await MentorProfile.deleteMany({ mentor: user._id });
        }
        await Report.deleteMany({ $or: [{ reporter: user._id }, { reportedUser: user._id }] });
        await User.findByIdAndDelete(req.params.id);

        res.json({ msg: "User deleted successfully" });
    } catch (error) {
        console.error("Admin deleteUser error:", error);
        res.status(500).json({ msg: "Failed to delete user" });
    }
};

// ── Mentor Management ──
exports.getAllMentors = async (req, res) => {
    try {
        const { search, status, page = 1, limit = 20 } = req.query;
        const userQuery = { role: "teacher" };

        if (search) {
            userQuery.$or = [
                { name: { $regex: search, $options: "i" } },
                { email: { $regex: search, $options: "i" } },
            ];
        }

        const teachers = await User.find(userQuery)
            .select("-passwordHash -verificationCode -resetCode")
            .sort({ createdAt: -1 });

        const teacherIds = teachers.map((t) => t._id);

        const profileQuery = { mentor: { $in: teacherIds } };
        if (status) profileQuery.status = status;

        const profiles = await MentorProfile.find(profileQuery);
        const profileMap = {};
        profiles.forEach((p) => {
            profileMap[p.mentor.toString()] = p;
        });

        const mentors = teachers.map((t) => ({
            ...t.toObject(),
            mentorProfile: profileMap[t._id.toString()] || null,
        }));

        // Filter by status if requested
        let filtered = mentors;
        if (status) {
            filtered = mentors.filter(
                (m) => m.mentorProfile && m.mentorProfile.status === status
            );
        }

        const total = filtered.length;
        const paginated = filtered.slice((page - 1) * limit, page * limit);

        res.json({
            mentors: paginated,
            total,
            page: Number(page),
            pages: Math.ceil(total / limit),
        });
    } catch (error) {
        console.error("Admin getAllMentors error:", error);
        res.status(500).json({ msg: "Failed to fetch mentors" });
    }
};

// ── Approvals ──
exports.getPendingApprovals = async (req, res) => {
    try {
        const profiles = await MentorProfile.find({ status: "pending" })
            .populate("mentor", "name email avatar createdAt isVerified")
            .sort({ submittedAt: -1 });

        res.json({ profiles });
    } catch (error) {
        console.error("Admin getPendingApprovals error:", error);
        res.status(500).json({ msg: "Failed to fetch pending approvals" });
    }
};

exports.updateMentorStatus = async (req, res) => {
    try {
        const { profileId } = req.params;
        const { status, adminNotes } = req.body;

        if (!["approved", "rejected", "pending"].includes(status)) {
            return res.status(400).json({ msg: "Invalid status" });
        }

        const profile = await MentorProfile.findByIdAndUpdate(
            profileId,
            { status, ...(adminNotes && { adminNotes }) },
            { new: true }
        ).populate("mentor", "name email avatar");

        if (!profile) return res.status(404).json({ msg: "Profile not found" });

        res.json({ profile, msg: `Mentor ${status} successfully` });
    } catch (error) {
        console.error("Admin updateMentorStatus error:", error);
        res.status(500).json({ msg: "Failed to update mentor status" });
    }
};

// ── Reports ──
exports.getAllReports = async (req, res) => {
    try {
        const { status, page = 1, limit = 20 } = req.query;
        const query = {};
        if (status) query.status = status;

        const total = await Report.countDocuments(query);
        const reports = await Report.find(query)
            .populate("reporter", "name email avatar role")
            .populate("reportedUser", "name email avatar role")
            .populate("resolvedBy", "name email")
            .sort({ createdAt: -1 })
            .skip((page - 1) * limit)
            .limit(Number(limit));

        res.json({ reports, total, page: Number(page), pages: Math.ceil(total / limit) });
    } catch (error) {
        console.error("Admin getAllReports error:", error);
        res.status(500).json({ msg: "Failed to fetch reports" });
    }
};

exports.updateReportStatus = async (req, res) => {
    try {
        const { reportId } = req.params;
        const { status, adminNotes } = req.body;

        if (!["reviewed", "resolved", "dismissed"].includes(status)) {
            return res.status(400).json({ msg: "Invalid status" });
        }

        const report = await Report.findByIdAndUpdate(
            reportId,
            {
                status,
                adminNotes: adminNotes || "",
                resolvedBy: req.user.id,
                resolvedAt: new Date(),
            },
            { new: true }
        )
            .populate("reporter", "name email avatar role")
            .populate("reportedUser", "name email avatar role");

        if (!report) return res.status(404).json({ msg: "Report not found" });

        res.json({ report, msg: `Report ${status} successfully` });
    } catch (error) {
        console.error("Admin updateReportStatus error:", error);
        res.status(500).json({ msg: "Failed to update report" });
    }
};

// ── Submit a report (any user) ──
exports.submitReport = async (req, res) => {
    try {
        const { reportedUserId, reason, description, category } = req.body;

        if (!reportedUserId || !reason) {
            return res.status(400).json({ msg: "Reported user and reason are required" });
        }

        const reportedUser = await User.findById(reportedUserId);
        if (!reportedUser) return res.status(404).json({ msg: "Reported user not found" });

        const report = await Report.create({
            reporter: req.user.id,
            reportedUser: reportedUserId,
            reason,
            description: description || "",
            category: category || "other",
        });

        res.status(201).json({ report, msg: "Report submitted successfully" });
    } catch (error) {
        console.error("submitReport error:", error);
        res.status(500).json({ msg: "Failed to submit report" });
    }
};

// ── Analytics ──
exports.getAnalytics = async (req, res) => {
    try {
        const now = new Date();
        const thirtyDaysAgo = new Date(now - 30 * 24 * 60 * 60 * 1000);
        const sevenDaysAgo = new Date(now - 7 * 24 * 60 * 60 * 1000);

        const [
            newUsersThisMonth,
            newUsersThisWeek,
            sessionsThisMonth,
            roleDistribution,
            mentorStatusDistribution,
            dailyRegistrations,
        ] = await Promise.all([
            User.countDocuments({ createdAt: { $gte: thirtyDaysAgo } }),
            User.countDocuments({ createdAt: { $gte: sevenDaysAgo } }),
            MentorshipSession.countDocuments({ createdAt: { $gte: thirtyDaysAgo } }),
            User.aggregate([{ $group: { _id: "$role", count: { $sum: 1 } } }]),
            MentorProfile.aggregate([{ $group: { _id: "$status", count: { $sum: 1 } } }]),
            User.aggregate([
                { $match: { createdAt: { $gte: thirtyDaysAgo } } },
                {
                    $group: {
                        _id: {
                            $dateToString: { format: "%Y-%m-%d", date: "$createdAt" },
                        },
                        count: { $sum: 1 },
                    },
                },
                { $sort: { _id: 1 } },
            ]),
        ]);

        res.json({
            newUsersThisMonth,
            newUsersThisWeek,
            sessionsThisMonth,
            roleDistribution,
            mentorStatusDistribution,
            dailyRegistrations,
        });
    } catch (error) {
        console.error("Admin getAnalytics error:", error);
        res.status(500).json({ msg: "Failed to fetch analytics" });
    }
};
