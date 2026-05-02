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
        } = req.body;

        if (!name || !email || !specializedCourses || !description) {
            return res.status(400).json({ msg: "Missing required profile fields" });
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

        const profile = await MentorProfile.findOne({ name: mentorName }).lean();
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
        const profiles = await MentorProfile.find().sort({ updatedAt: -1 });
        res.json({ mentors: profiles });
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

        const mentorName = req.query.mentorName || req.user.name;
        const requests = await MentorshipSession.find({
            mentorName,
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
                mentorName,
                status: "pending",
            },
            {
                $set: { status: "accepted" },
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
                mentorName,
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

        const mentorName = req.query.mentorName || req.user.name;
        const allSessions = await MentorshipSession.find({
            mentorName,
            status: "accepted",
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
            status: "accepted",
        }).sort({ createdAt: -1 });

        const now = new Date();
        const upcoming = allSessions.filter(session => {
            const start = parseSessionDateTime(session.dateLabel, session.timeSlot);
            if (!start) return false;
            const end = new Date(start.getTime() + 60 * 60 * 1000);
            return end > now;
        });

        res.json({ sessions: upcoming });
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
            status: { $in: ["pending", "accepted"] },
        });

        res.json({ busy: Boolean(session) });
    } catch (error) {
        console.error("isMentorBusy error:", error);
        res.status(500).json({ msg: "Failed to check mentor availability" });
    }
};
