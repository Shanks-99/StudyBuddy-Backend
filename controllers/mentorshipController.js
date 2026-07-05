const mongoose = require("mongoose");
const MentorProfile = require("../models/MentorProfile");
const MentorshipSession = require("../models/MentorshipSession");

const DEFAULT_AVAILABILITY = {
    sun: [],
    mon: [],
    tue: [],
    wed: [],
    thu: [],
    fri: [],
    sat: [],
};

const normalizeAvailability = (availability = {}) => ({
    sun: Array.isArray(availability.sun) ? availability.sun : [],
    mon: Array.isArray(availability.mon) ? availability.mon : [],
    tue: Array.isArray(availability.tue) ? availability.tue : [],
    wed: Array.isArray(availability.wed) ? availability.wed : [],
    thu: Array.isArray(availability.thu) ? availability.thu : [],
    fri: Array.isArray(availability.fri) ? availability.fri : [],
    sat: Array.isArray(availability.sat) ? availability.sat : [],
});

const ensureTeacher = (req, res) => {
    if (req.user?.role !== "teacher") {
        res.status(403).json({ msg: "Only instructors can access this endpoint" });
        return false;
    }
    return true;
};

const ensureStudent = (req, res) => {
    if (req.user?.role !== "student") {
        res.status(403).json({ msg: "Only students can access this endpoint" });
        return false;
    }
    return true;
};

exports.getMyMentorProfile = async (req, res) => {
    try {
        if (!ensureTeacher(req, res)) return;

        const profile = await MentorProfile.findOne({ mentor: req.user.id });
        res.json({ profile });
    } catch (error) {
        console.error("getMyMentorProfile error:", error);
        res.status(500).json({ msg: "Failed to fetch mentor profile" });
    }
};

exports.upsertMyMentorProfile = async (req, res) => {
    try {
        if (!ensureTeacher(req, res)) return;

        const {
            name,
            email,
            specializedCourses,
            description,
            degreeFiles = [],
            qualification,
            skillLevel,
            tags = [],
            profilePicture,
            hourlyRate,
            status,
            bankAccountNumber = "",
            easypaisaNumber = "",
        } = req.body;

        if (!name || !email || !specializedCourses || !description) {
            return res.status(400).json({ msg: "Missing required profile fields" });
        }

        if (!String(bankAccountNumber || "").trim() && !String(easypaisaNumber || "").trim()) {
            return res.status(400).json({ msg: "Please fill at least one of the payment details (Bank Account or Easypaisa)" });
        }

        let profile = await MentorProfile.findOne({ mentor: req.user.id });

        if (profile) {
            // Update
            profile.name = name;
            profile.email = email;
            profile.specializedCourses = specializedCourses;
            profile.description = description;
            profile.degreeFiles = degreeFiles;
            profile.qualification = qualification;
            profile.skillLevel = skillLevel;
            profile.tags = tags;
            profile.profilePicture = profilePicture;
            profile.hourlyRate = hourlyRate !== undefined ? Number(hourlyRate) : 0;
            profile.bankAccountNumber = bankAccountNumber;
            profile.easypaisaNumber = easypaisaNumber;
            profile.status = "pending"; 
            await profile.save();
        } else {
            // Create
            profile = new MentorProfile({
                mentor: req.user.id,
                name,
                email,
                specializedCourses,
                description,
                degreeFiles,
                qualification,
                skillLevel,
                tags,
                profilePicture,
                hourlyRate: hourlyRate !== undefined ? Number(hourlyRate) : 0,
                bankAccountNumber,
                easypaisaNumber,
                status: "pending",
            });
            await profile.save();
        }

        res.json({ profile });
    } catch (error) {
        console.error("upsertMyMentorProfile error:", error);
        res.status(500).json({ msg: "Failed to save mentor profile" });
    }
};

exports.getMyAvailability = async (req, res) => {
    try {
        if (!ensureTeacher(req, res)) return;

        const profile = await MentorProfile.findOne({ mentor: req.user.id });
        const availability = profile?.weeklyAvailability
            ? normalizeAvailability(profile.weeklyAvailability)
            : DEFAULT_AVAILABILITY;

        res.json({ availability });
    } catch (error) {
        console.error("getMyAvailability error:", error);
        res.status(500).json({ msg: "Failed to fetch availability" });
    }
};

exports.updateMyAvailability = async (req, res) => {
    try {
        if (!ensureTeacher(req, res)) return;

        const availability = normalizeAvailability(req.body || {});

        const profile = await MentorProfile.findOneAndUpdate(
            { mentor: req.user.id },
            {
                $set: {
                    mentor: req.user.id,
                    weeklyAvailability: availability,
                },
                $setOnInsert: {
                    name: req.user.name,
                    email: "",
                    specializedCourses: "",
                    description: "",
                    degreeFiles: [],
                    status: "pending",
                },
            },
            { new: true, upsert: true }
        );

        res.json({ availability: profile.weeklyAvailability });
    } catch (error) {
        console.error("updateMyAvailability error:", error);
        res.status(500).json({ msg: "Failed to save availability" });
    }
};

exports.getAvailabilityByMentorName = async (req, res) => {
    try {
        const mentorName = req.query.mentorName;
        if (!mentorName) {
            return res.status(400).json({ msg: "mentorName is required" });
        }

        const profile = await MentorProfile.findOne({ name: mentorName, status: "approved" }).lean();
        if (!profile) {
            return res.json({ availability: DEFAULT_AVAILABILITY });
        }

        const availability = profile.weeklyAvailability
            ? normalizeAvailability(profile.weeklyAvailability)
            : DEFAULT_AVAILABILITY;

        res.json({ availability });
    } catch (error) {
        console.error("getAvailabilityByMentorName error:", error);
        res.status(500).json({ msg: "Failed to fetch mentor availability" });
    }
};

exports.listMentorsForStudents = async (_req, res) => {
    try {
        const allApprovedProfiles = await MentorProfile.find({ status: "approved" })
            .select("-degreeFiles")
            .sort({ updatedAt: -1 });
        
        // Filter out mentors who haven't set any availability
        const profilesWithAvailability = allApprovedProfiles.filter(profile => {
            const hasAvailability = Object.values(profile.weeklyAvailability || {}).some(
                daySlots => Array.isArray(daySlots) && daySlots.length > 0
            );
            return hasAvailability;
        });

        res.json({ mentors: profilesWithAvailability });
    } catch (error) {
        console.error("listMentorsForStudents error:", error);
        res.status(500).json({ msg: "Failed to fetch mentors" });
    }
};

const { createNotification } = require("./notificationController");

exports.createSessionRequest = async (req, res) => {
    try {
        if (!ensureStudent(req, res)) return;

        const {
            mentorId,
            mentorName,
            subject,
            dateLabel,
            timeSlot,
            message,
        } = req.body;

        if (!mentorName || !subject || !dateLabel || !timeSlot) {
            return res.status(400).json({ msg: "Missing required session request fields" });
        }

        const duplicate = await MentorshipSession.findOne({
            mentorName,
            dateLabel,
            timeSlot,
            status: { $in: ["pending", "accepted"] },
        });

        if (duplicate) {
            return res.status(409).json({ msg: "Mentor already has a request/session for this slot" });
        }

        const payload = {
            mentorName: String(mentorName).trim(),
            studentName: req.user.name,
            subject: String(subject).trim(),
            dateLabel: String(dateLabel).trim(),
            timeSlot: String(timeSlot).trim(),
            message: String(message || "").trim(),
            status: "pending",
            mode: "Video",
        };

        if (mentorId && mongoose.Types.ObjectId.isValid(mentorId)) {
            payload.mentor = mentorId;
        }
        if (req.user.id && mongoose.Types.ObjectId.isValid(req.user.id)) {
            payload.student = req.user.id;
        }

        const session = await MentorshipSession.create(payload);

        // Notify Mentor
        if (payload.mentor) {
            await createNotification(
                payload.mentor,
                "New Mentorship Request",
                `${req.user.name} requested a session for ${subject} on ${dateLabel} at ${timeSlot}`,
                "mentorship_request",
                "/instructor-dashboard"
            );
        }

        res.status(201).json({ session });
    } catch (error) {
        console.error("createSessionRequest error:", error);
        res.status(500).json({ msg: "Failed to create session request" });
    }
};

exports.getSessionRequestsForMentor = async (req, res) => {
    try {
        if (!ensureTeacher(req, res)) return;

        const requests = await MentorshipSession.find({
            $or: [
                { mentor: req.user.id },
                { mentorName: req.user.name }
            ],
            status: "pending",
        }).sort({ createdAt: -1 });

        res.json({ requests });
    } catch (error) {
        console.error("getSessionRequestsForMentor error:", error);
        res.status(500).json({ msg: "Failed to fetch mentor requests" });
    }
};

exports.acceptSessionRequest = async (req, res) => {
    try {
        if (!ensureTeacher(req, res)) return;

        const { requestId } = req.params;
        const mentorName = req.body.mentorName || req.user.name;

        const session = await MentorshipSession.findOneAndUpdate(
            {
                _id: requestId,
                $or: [
                    { mentor: req.user.id },
                    { mentorName: req.user.name }
                ],
                status: "pending",
            },
            {
                $set: { status: "accepted", paymentStatus: "accepted" },
            },
            { new: true }
        );

        if (!session) {
            return res.status(404).json({ msg: "Session request not found" });
        }

        // Notify Student
        if (session.student) {
            await createNotification(
                session.student,
                "Mentorship Session Accepted",
                `Your session request to ${mentorName} for ${session.subject} on ${session.dateLabel} at ${session.timeSlot} has been accepted!`,
                "mentorship_status",
                "/student-dashboard"
            );
        }

        res.json({ session });
    } catch (error) {
        console.error("acceptSessionRequest error:", error);
        res.status(500).json({ msg: "Failed to accept session request" });
    }
};

exports.declineSessionRequest = async (req, res) => {
    try {
        if (!ensureTeacher(req, res)) return;

        const { requestId } = req.params;
        const mentorName = req.body.mentorName || req.user.name;

        const session = await MentorshipSession.findOneAndUpdate(
            {
                _id: requestId,
                $or: [
                    { mentor: req.user.id },
                    { mentorName: req.user.name }
                ],
                status: "pending",
            },
            {
                $set: { status: "declined" },
            },
            { new: true }
        );

        if (!session) {
            return res.status(404).json({ msg: "Session request not found" });
        }

        // Notify Student
        if (session.student) {
            await createNotification(
                session.student,
                "Mentorship Session Declined",
                `Sorry, your session request to ${mentorName} for ${session.subject} on ${session.dateLabel} at ${session.timeSlot} has been declined.`,
                "mentorship_status",
                "/mentorship"
            );
        }

        res.json({ session });
    } catch (error) {
        console.error("declineSessionRequest error:", error);
        res.status(500).json({ msg: "Failed to decline session request" });
    }
};

exports.getUpcomingSessionsForMentor = async (req, res) => {
    try {
        if (!ensureTeacher(req, res)) return;

        const allSessions = await MentorshipSession.find({
            $or: [
                { mentor: req.user.id },
                { mentorName: req.user.name }
            ],
            status: { $in: ["accepted", "scheduled"] },
        }).sort({ createdAt: -1 });

        // Filter for upcoming only (session ends 1 hour after start)
        const now = new Date();
        const upcoming = allSessions.filter(session => {
            const start = parseSessionDateTime(session.dateLabel, session.timeSlot);
            if (!start) return false;
            const end = new Date(start.getTime() + 60 * 60 * 1000);
            return end > now;
        });

        res.json({ sessions: upcoming });
    } catch (error) {
        console.error("getUpcomingSessionsForMentor error:", error);
        res.status(500).json({ msg: "Failed to fetch mentor upcoming sessions" });
    }
};

// Helper for parsing session date/time strings
function parseSessionDateTime(dateLabel, timeSlot) {
    try {
        const date = new Date(dateLabel);
        if (isNaN(date.getTime())) return null;

        const timeMatch = timeSlot.trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
        if (!timeMatch) return null;

        let hour = parseInt(timeMatch[1]);
        const minute = parseInt(timeMatch[2]);
        const meridiem = timeMatch[3].toUpperCase();

        if (meridiem === 'PM' && hour !== 12) hour += 12;
        if (meridiem === 'AM' && hour === 12) hour = 0;

        date.setHours(hour, minute, 0, 0);
        return date;
    } catch (e) {
        return null;
    }
}

exports.getUpcomingSessionsForStudent = async (req, res) => {
    try {
        if (!ensureStudent(req, res)) return;

        const allSessions = await MentorshipSession.find({
            $or: [
                { student: req.user.id },
                { studentName: req.user.name },
            ],
            status: { $in: ["accepted", "scheduled"] },
        }).sort({ createdAt: -1 });

        const now = new Date();
        const upcoming = allSessions.filter(session => {
            const start = parseSessionDateTime(session.dateLabel, session.timeSlot);
            if (!start) return false;
            const end = new Date(start.getTime() + 60 * 60 * 1000);
            return end > now;
        });

        // Attach mentor profile payment details dynamically
        const sessionsWithProfiles = await Promise.all(upcoming.map(async (session) => {
            const sessionObj = session.toObject ? session.toObject() : session;
            if (session.mentor) {
                const profile = await MentorProfile.findOne({ mentor: session.mentor });
                if (profile) {
                    sessionObj.mentorProfile = {
                        bankAccountNumber: profile.bankAccountNumber || "",
                        easypaisaNumber: profile.easypaisaNumber || ""
                    };
                }
            }
            return sessionObj;
        }));

        res.json({ sessions: sessionsWithProfiles });
    } catch (error) {
        console.error("getUpcomingSessionsForStudent error:", error);
        res.status(500).json({ msg: "Failed to fetch student upcoming sessions" });
    }
};

exports.isMentorBusy = async (req, res) => {
    try {
        const { mentorName, dateLabel, timeSlot } = req.query;

        if (!mentorName || !dateLabel || !timeSlot) {
            return res.status(400).json({ msg: "mentorName, dateLabel and timeSlot are required" });
        }

        const session = await MentorshipSession.findOne({
            mentorName,
            dateLabel,
            timeSlot,
            status: { $in: ["pending", "accepted", "scheduled"] },
        });

        res.json({ busy: Boolean(session) });
    } catch (error) {
        console.error("isMentorBusy error:", error);
        res.status(500).json({ msg: "Failed to check mentor availability" });
    }
};

// ── Student: Mark 1-1 session payment as sent ──
exports.markSessionPaymentSent = async (req, res) => {
    try {
        if (!ensureStudent(req, res)) return;

        const { sessionId } = req.params;
        const session = await MentorshipSession.findOneAndUpdate(
            { _id: sessionId, student: req.user.id, status: "accepted" },
            { $set: { paymentStatus: "sent" } },
            { new: true }
        );

        if (!session) {
            return res.status(404).json({ msg: "Mentorship session not found or not accepted yet" });
        }

        // Notify mentor
        if (session.mentor) {
            await createNotification(
                session.mentor,
                "Payment Received — Verification Needed",
                `${req.user.name} has marked payment as sent for mentorship session. Please verify.`,
                "payment_verification",
                "/instructor-mentorship"
            );
        }

        res.json({ session });
    } catch (error) {
        console.error("markSessionPaymentSent error:", error);
        res.status(500).json({ msg: "Failed to mark payment as sent" });
    }
};

// ── Mentor: Verify 1-1 session payment ──
exports.verifySessionPayment = async (req, res) => {
    try {
        if (!ensureTeacher(req, res)) return;

        const { sessionId } = req.params;
        const session = await MentorshipSession.findOneAndUpdate(
            { _id: sessionId, mentor: req.user.id, status: "accepted" },
            { $set: { paymentStatus: "verified", status: "scheduled" } },
            { new: true }
        );

        if (!session) {
            return res.status(404).json({ msg: "Mentorship session not found or not in accepted state" });
        }

        // Notify student
        if (session.student) {
            await createNotification(
                session.student,
                "Payment Verified — Session Scheduled!",
                `Your payment to ${session.mentorName} has been verified. The session is now officially scheduled!`,
                "mentorship_status",
                "/student-dashboard"
            );
        }

        res.json({ session });
    } catch (error) {
        console.error("verifySessionPayment error:", error);
        res.status(500).json({ msg: "Failed to verify payment" });
    }
};

// ── Mentor: Reject 1-1 session payment ──
exports.rejectSessionPayment = async (req, res) => {
    try {
        if (!ensureTeacher(req, res)) return;

        const { sessionId } = req.params;
        const session = await MentorshipSession.findOneAndUpdate(
            { _id: sessionId, mentor: req.user.id, status: "accepted" },
            { $set: { paymentStatus: "rejected" } },
            { new: true }
        );

        if (!session) {
            return res.status(404).json({ msg: "Mentorship session not found or not in accepted state" });
        }

        // Notify student
        if (session.student) {
            await createNotification(
                session.student,
                "Payment Rejected — Please Retry",
                `Your payment to ${session.mentorName} was not verified. Please re-send the payment and try again.`,
                "mentorship_status",
                "/student-dashboard"
            );
        }

        res.json({ session });
    } catch (error) {
        console.error("rejectSessionPayment error:", error);
        res.status(500).json({ msg: "Failed to reject payment" });
    }
};

exports.getMentorDashboardStats = async (req, res) => {
    try {
        if (!ensureTeacher(req, res)) return;

        const mentorId = req.user.id;

        // 1. Total Students Helped
        // Get unique student names from MentorshipSession (accepted/scheduled)
        const mentorshipSessions = await MentorshipSession.find({
            $or: [
                { mentor: mentorId },
                { mentorName: req.user.name }
            ],
            status: { $in: ["accepted", "scheduled"] }
        });
        const mentorshipStudentNames = mentorshipSessions.map(s => s.studentName).filter(Boolean);
        
        // Get unique student names from GroupSession participants
        const GroupSession = require("../models/GroupSession");
        const groupSessions = await GroupSession.find({ mentor: mentorId });
        const groupStudentNames = [];
        groupSessions.forEach(s => {
            if (s.participants) {
                s.participants.forEach(p => {
                    if (p.studentName) {
                        groupStudentNames.push(p.studentName);
                    }
                });
            }
        });
        
        const allStudents = new Set([...mentorshipStudentNames, ...groupStudentNames]);
        const totalStudentsHelped = allStudents.size;

        // 2. Resources Uploaded
        const Resource = require("../models/Resource");
        const resourcesCount = await Resource.countDocuments({ uploader: mentorId });

        // 3. Community Answers
        const CommunityComment = require("../models/CommunityComment");
        const commentsCount = await CommunityComment.countDocuments({ author: mentorId });

        res.json({
            totalStudentsHelped,
            resourcesUploaded: resourcesCount,
            communityAnswers: commentsCount
        });
    } catch (error) {
        console.error("getMentorDashboardStats error:", error);
        res.status(500).json({ msg: "Failed to fetch mentor dashboard stats" });
    }
};

exports.getMyStudentsForMentor = async (req, res) => {
    try {
        const mentorId = req.user.id;
        
        // Find all mentorship sessions where this mentor is teaching
        const sessions = await MentorshipSession.find({
            $or: [
                { mentor: mentorId },
                { mentorName: req.user.name }
            ]
        }).populate("student", "name email avatar grade field bio");

        // Fetch all resources uploaded by this mentor so they can view shared materials
        const Resource = require("../models/Resource");
        const mentorResources = await Resource.find({ uploader: mentorId });

        // Map and group sessions by student
        const studentMap = {};

        sessions.forEach(session => {
            // If student object is missing, try to resolve it from studentName
            const studentId = session.student?._id?.toString() || session.studentName || "unknown";
            
            if (!studentMap[studentId]) {
                studentMap[studentId] = {
                    _id: session.student?._id || null,
                    name: session.student?.name || session.studentName,
                    email: session.student?.email || "N/A",
                    avatar: session.student?.avatar || "",
                    grade: session.student?.grade || "N/A",
                    field: session.student?.field || "N/A",
                    bio: session.student?.bio || "",
                    subject: session.subject,
                    lastSessionDate: session.dateLabel,
                    status: "Inactive",
                    sessionHistory: [],
                };
            }

            // Append session details to history
            studentMap[studentId].sessionHistory.push({
                _id: session._id,
                dateLabel: session.dateLabel,
                timeSlot: session.timeSlot,
                status: session.status,
                paymentStatus: session.paymentStatus,
                subject: session.subject,
            });
        });

        // Convert the map to array and compute aggregated states
        const studentsList = Object.values(studentMap).map(std => {
            // Sort history by date descending
            std.sessionHistory.sort((a, b) => {
                const aDateStr = a.dateLabel ? (a.dateLabel.split(',')[1] || a.dateLabel) : "";
                const bDateStr = b.dateLabel ? (b.dateLabel.split(',')[1] || b.dateLabel) : "";
                const aDate = aDateStr ? new Date(aDateStr) : new Date(0);
                const bDate = bDateStr ? new Date(bDateStr) : new Date(0);
                
                if (isNaN(aDate.getTime())) return 1;
                if (isNaN(bDate.getTime())) return -1;
                
                return bDate - aDate;
            });

            // Find last session date
            if (std.sessionHistory.length > 0) {
                std.lastSessionDate = std.sessionHistory[0].dateLabel || "-";
            } else {
                std.lastSessionDate = "-";
            }

            // Determine aggregate status
            const hasActive = std.sessionHistory.some(s => s.status && ["accepted", "scheduled"].includes(s.status.toLowerCase()));
            const hasPending = std.sessionHistory.some(s => s.status && s.status.toLowerCase() === "pending");
            const hasCompleted = std.sessionHistory.some(s => s.status && s.status.toLowerCase() === "completed");

            if (hasActive) std.status = "Active";
            else if (hasCompleted) std.status = "Completed";
            else if (hasPending) std.status = "Pending";
            else std.status = "Inactive";

            // Attach matching shared resources
            std.sharedResources = mentorResources.map(res => ({
                id: res._id,
                name: res.title || "Untitled Resource",
                type: res.category || "Document",
                downloads: res.downloadsCount || 0,
                date: res.createdAt ? new Date(res.createdAt).toLocaleDateString() : "-"
            }));

            return std;
        });

        res.status(200).json(studentsList);
    } catch (error) {
        console.error("getMyStudentsForMentor error:", error);
        res.status(500).json({ message: "Failed to fetch student connections", error: error.message });
    }
};
