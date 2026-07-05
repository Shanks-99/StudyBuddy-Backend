const mongoose = require("mongoose");
const GroupSession = require("../models/GroupSession");
const CommunityPost = require("../models/CommunityPost");
const MentorProfile = require("../models/MentorProfile");
const { createNotification } = require("./notificationController");

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

// ── Student: Create a group session request ──
exports.createGroupSessionRequest = async (req, res) => {
    try {
        if (!ensureStudent(req, res)) return;

        const { mentorId, mentorName, topic, description, dateLabel, timeSlot, maxParticipants } = req.body;

        if (!mentorId || !mentorName || !topic || !description || !dateLabel || !timeSlot) {
            return res.status(400).json({ msg: "Missing required fields" });
        }

        // Fetch the mentor's hourly rate to calculate group rate
        const mentorProfile = await MentorProfile.findOne({ mentor: mentorId, status: "approved" });
        const hourlyRate = mentorProfile?.hourlyRate || 0;
        const groupRate = Math.round(hourlyRate / 2);

        const session = await GroupSession.create({
            mentor: mentorId,
            createdBy: req.user.id,
            mentorName: String(mentorName).trim(),
            topic: String(topic).trim(),
            description: String(description).trim(),
            dateLabel: String(dateLabel).trim(),
            timeSlot: String(timeSlot).trim(),
            maxParticipants: maxParticipants || 10,
            rate: groupRate,
            status: "pending",
            participants: [
                {
                    student: req.user.id,
                    studentName: req.user.name,
                    paymentStatus: "pending",
                    joinedAt: new Date(),
                },
            ],
        });

        // Notify mentor
        await createNotification(
            mentorId,
            "New Group Session Request",
            `${req.user.name} requested a group session: "${topic}" on ${dateLabel} at ${timeSlot}`,
            "group_session_request",
            "/instructor-mentorship"
        );

        res.status(201).json({ session });
    } catch (error) {
        console.error("createGroupSessionRequest error:", error);
        res.status(500).json({ msg: "Failed to create group session request" });
    }
};

// ── Mentor: Get group session requests ──
exports.getGroupRequestsForMentor = async (req, res) => {
    try {
        if (!ensureTeacher(req, res)) return;

        const sessions = await GroupSession.find({
            mentor: req.user.id,
            status: { $in: ["pending", "accepted"] },
        })
            .populate("createdBy", "name email")
            .sort({ createdAt: -1 });

        res.json({ sessions });
    } catch (error) {
        console.error("getGroupRequestsForMentor error:", error);
        res.status(500).json({ msg: "Failed to fetch group session requests" });
    }
};

// ── Mentor: Accept a group session request ──
exports.acceptGroupRequest = async (req, res) => {
    try {
        if (!ensureTeacher(req, res)) return;

        const session = await GroupSession.findOneAndUpdate(
            { _id: req.params.id, mentor: req.user.id, status: "pending" },
            { $set: { status: "accepted" } },
            { new: true }
        );

        if (!session) {
            return res.status(404).json({ msg: "Group session request not found" });
        }

        // Notify the student who created the request
        await createNotification(
            session.createdBy,
            "Group Session Accepted — Payment Required",
            `Your group session "${session.topic}" has been accepted by ${session.mentorName}. Please complete payment of Rs. ${session.rate} to confirm.`,
            "group_session_status",
            "/mentorship"
        );

        res.json({ session });
    } catch (error) {
        console.error("acceptGroupRequest error:", error);
        res.status(500).json({ msg: "Failed to accept group session request" });
    }
};

// ── Mentor: Decline a group session request ──
exports.declineGroupRequest = async (req, res) => {
    try {
        if (!ensureTeacher(req, res)) return;

        const session = await GroupSession.findOneAndUpdate(
            { _id: req.params.id, mentor: req.user.id, status: "pending" },
            { $set: { status: "declined" } },
            { new: true }
        );

        if (!session) {
            return res.status(404).json({ msg: "Group session request not found" });
        }

        await createNotification(
            session.createdBy,
            "Group Session Request Declined",
            `Sorry, your group session request "${session.topic}" has been declined by ${session.mentorName}.`,
            "group_session_status",
            "/mentorship"
        );

        res.json({ session });
    } catch (error) {
        console.error("declineGroupRequest error:", error);
        res.status(500).json({ msg: "Failed to decline group session request" });
    }
};

// ── Student: Mark payment as sent (creator) ──
exports.markPaymentSent = async (req, res) => {
    try {
        if (!ensureStudent(req, res)) return;

        const session = await GroupSession.findOne({
            _id: req.params.id,
            status: "accepted",
        });

        if (!session) {
            return res.status(404).json({ msg: "Group session not found or not in accepted state" });
        }

        // Find the participant entry for this student
        const participant = session.participants.find(
            (p) => String(p.student) === String(req.user.id)
        );

        if (!participant) {
            return res.status(403).json({ msg: "You are not a participant in this session" });
        }

        if (participant.paymentStatus === "verified") {
            return res.status(400).json({ msg: "Payment already verified" });
        }

        participant.paymentStatus = "sent";
        await session.save();

        // Notify mentor
        await createNotification(
            session.mentor,
            "Payment Received — Verification Needed",
            `${req.user.name} has marked payment as sent for group session "${session.topic}". Please verify.`,
            "group_payment_verification",
            "/instructor-mentorship"
        );

        res.json({ session });
    } catch (error) {
        console.error("markPaymentSent error:", error);
        res.status(500).json({ msg: "Failed to mark payment as sent" });
    }
};

// ── Mentor: Verify a participant's payment ──
exports.verifyPayment = async (req, res) => {
    try {
        if (!ensureTeacher(req, res)) return;

        const { studentId } = req.body;
        if (!studentId) {
            return res.status(400).json({ msg: "studentId is required" });
        }

        const session = await GroupSession.findOne({
            _id: req.params.id,
            mentor: req.user.id,
        });

        if (!session) {
            return res.status(404).json({ msg: "Group session not found" });
        }

        const participant = session.participants.find(
            (p) => String(p.student) === String(studentId)
        );

        if (!participant) {
            return res.status(404).json({ msg: "Participant not found" });
        }

        if (participant.paymentStatus !== "sent") {
            return res.status(400).json({ msg: "Payment has not been marked as sent yet" });
        }

        participant.paymentStatus = "verified";

        // Check if this is the creator and it's the first verification → schedule session
        const isCreator = String(session.createdBy) === String(studentId);
        if (isCreator && session.status === "accepted") {
            session.status = "scheduled";

            // Auto-create community post
            const postContent = `📢 **GROUP MENTORSHIP SESSION**\n\n📌 **Topic:** ${session.topic}\n👨‍🏫 **Mentor:** ${session.mentorName}\n📅 **Date:** ${session.dateLabel} at ${session.timeSlot}\n👥 **Spots:** 1/${session.maxParticipants} filled\n💰 **Rate:** Rs. ${session.rate} / participant\n\n${session.description}`;

            const communityPost = await CommunityPost.create({
                author: session.mentor,
                content: postContent,
                category: "group-session",
                groupSessionRef: session._id,
            });

            session.communityPostId = communityPost._id;
        }

        await session.save();

        // Notify student
        await createNotification(
            studentId,
            "Payment Verified — Session Scheduled!",
            `Your payment for "${session.topic}" has been verified. The session is now officially scheduled!`,
            "group_session_status",
            "/mentorship"
        );

        res.json({ session });
    } catch (error) {
        console.error("verifyPayment error:", error);
        res.status(500).json({ msg: "Failed to verify payment" });
    }
};

// ── Mentor: Reject a participant's payment ──
exports.rejectPayment = async (req, res) => {
    try {
        if (!ensureTeacher(req, res)) return;

        const { studentId } = req.body;
        if (!studentId) {
            return res.status(400).json({ msg: "studentId is required" });
        }

        const session = await GroupSession.findOne({
            _id: req.params.id,
            mentor: req.user.id,
        });

        if (!session) {
            return res.status(404).json({ msg: "Group session not found" });
        }

        const participant = session.participants.find(
            (p) => String(p.student) === String(studentId)
        );

        if (!participant) {
            return res.status(404).json({ msg: "Participant not found" });
        }

        participant.paymentStatus = "rejected";
        await session.save();

        await createNotification(
            studentId,
            "Payment Rejected — Please Retry",
            `Your payment for "${session.topic}" was not verified. Please re-send the payment and try again.`,
            "group_session_status",
            "/mentorship"
        );

        res.json({ session });
    } catch (error) {
        console.error("rejectPayment error:", error);
        res.status(500).json({ msg: "Failed to reject payment" });
    }
};

// ── Student: Get their group sessions ──
exports.getGroupSessionsForStudent = async (req, res) => {
    try {
        if (!ensureStudent(req, res)) return;

        const sessions = await GroupSession.find({
            "participants.student": req.user.id,
        })
            .populate("mentor", "name")
            .sort({ createdAt: -1 });

        // Attach mentor profile payment details dynamically
        const sessionsWithProfiles = await Promise.all(sessions.map(async (session) => {
            const sessionObj = session.toObject ? session.toObject() : session;
            if (session.mentor) {
                const profile = await MentorProfile.findOne({ mentor: session.mentor._id || session.mentor });
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
        console.error("getGroupSessionsForStudent error:", error);
        res.status(500).json({ msg: "Failed to fetch group sessions" });
    }
};

// ── Other Student: Join a group session from community ──
exports.joinGroupSession = async (req, res) => {
    try {
        if (!ensureStudent(req, res)) return;

        const session = await GroupSession.findOne({
            _id: req.params.id,
            status: "scheduled",
        });

        if (!session) {
            return res.status(404).json({ msg: "Group session not found or not scheduled" });
        }

        // Check if already a participant
        const participantsList = session.participants || [];
        const existing = participantsList.find(
            (p) => String(p.student) === String(req.user.id)
        );
        if (existing) {
            return res.status(400).json({ msg: "You have already joined this session" });
        }

        // Check capacity
        const verifiedCount = participantsList.filter(
            (p) => p.paymentStatus === "verified"
        ).length;
        if (verifiedCount >= session.maxParticipants) {
            return res.status(400).json({ msg: "This session is full" });
        }

        if (!session.participants) {
            session.participants = [];
        }
        session.participants.push({
            student: req.user.id,
            studentName: req.user.name,
            paymentStatus: "pending",
            joinedAt: new Date(),
        });

        await session.save();

        // Notify mentor about new joiner
        await createNotification(
            session.mentor,
            "New Participant Joined Group Session",
            `${req.user.name} wants to join your group session "${session.topic}".`,
            "group_session_join",
            "/instructor-mentorship"
        );

        res.json({ session });
    } catch (error) {
        console.error("joinGroupSession error:", error);
        res.status(500).json({ msg: "Failed to join group session" });
    }
};

// ── Student (joiner): Mark payment as sent ──
exports.joinPaymentSent = async (req, res) => {
    try {
        if (!ensureStudent(req, res)) return;

        const session = await GroupSession.findOne({
            _id: req.params.id,
            status: "scheduled",
        });

        if (!session) {
            return res.status(404).json({ msg: "Group session not found" });
        }

        const participant = (session.participants || []).find(
            (p) => String(p.student) === String(req.user.id)
        );

        if (!participant) {
            return res.status(403).json({ msg: "You are not a participant in this session" });
        }

        if (participant.paymentStatus === "verified") {
            return res.status(400).json({ msg: "Payment already verified" });
        }

        participant.paymentStatus = "sent";
        await session.save();

        await createNotification(
            session.mentor,
            "Payment Received — Verification Needed",
            `${req.user.name} has marked payment as sent to join group session "${session.topic}". Please verify.`,
            "group_payment_verification",
            "/instructor-mentorship"
        );

        res.json({ session });
    } catch (error) {
        console.error("joinPaymentSent error:", error);
        res.status(500).json({ msg: "Failed to mark payment as sent" });
    }
};

// ── Mentor: Verify a joiner's payment ──
exports.verifyJoinPayment = async (req, res) => {
    try {
        if (!ensureTeacher(req, res)) return;

        const { studentId } = req.body;
        if (!studentId) {
            return res.status(400).json({ msg: "studentId is required" });
        }

        const session = await GroupSession.findOne({
            _id: req.params.id,
            mentor: req.user.id,
            status: "scheduled",
        });

        if (!session) {
            return res.status(404).json({ msg: "Group session not found" });
        }

        const participant = session.participants.find(
            (p) => String(p.student) === String(studentId)
        );

        if (!participant || participant.paymentStatus !== "sent") {
            return res.status(400).json({ msg: "Payment has not been marked as sent" });
        }

        participant.paymentStatus = "verified";
        await session.save();

        // Update community post participant count
        if (session.communityPostId) {
            const verifiedCount = session.participants.filter(
                (p) => p.paymentStatus === "verified"
            ).length;

            const postContent = `📢 **GROUP MENTORSHIP SESSION**\n\n📌 **Topic:** ${session.topic}\n👨‍🏫 **Mentor:** ${session.mentorName}\n📅 **Date:** ${session.dateLabel} at ${session.timeSlot}\n👥 **Spots:** ${verifiedCount}/${session.maxParticipants} filled\n💰 **Rate:** Rs. ${session.rate} / participant\n\n${session.description}`;

            await CommunityPost.findByIdAndUpdate(session.communityPostId, {
                content: postContent,
            });
        }

        await createNotification(
            studentId,
            "Payment Verified — You're In!",
            `Your payment for "${session.topic}" has been verified. You're enrolled in the group session!`,
            "group_session_status",
            "/mentorship"
        );

        res.json({ session });
    } catch (error) {
        console.error("verifyJoinPayment error:", error);
        res.status(500).json({ msg: "Failed to verify join payment" });
    }
};

// ── Mentor: Reject a joiner's payment ──
exports.rejectJoinPayment = async (req, res) => {
    try {
        if (!ensureTeacher(req, res)) return;

        const { studentId } = req.body;
        if (!studentId) {
            return res.status(400).json({ msg: "studentId is required" });
        }

        const session = await GroupSession.findOne({
            _id: req.params.id,
            mentor: req.user.id,
        });

        if (!session) {
            return res.status(404).json({ msg: "Group session not found" });
        }

        const participant = session.participants.find(
            (p) => String(p.student) === String(studentId)
        );

        if (!participant) {
            return res.status(404).json({ msg: "Participant not found" });
        }

        participant.paymentStatus = "rejected";
        await session.save();

        await createNotification(
            studentId,
            "Payment Rejected — Please Retry",
            `Your payment for "${session.topic}" was not verified. Please re-send the payment and try again.`,
            "group_session_status",
            "/mentorship"
        );

        res.json({ session });
    } catch (error) {
        console.error("rejectJoinPayment error:", error);
        res.status(500).json({ msg: "Failed to reject join payment" });
    }
};

// ── Get single group session details ──
exports.getGroupSessionById = async (req, res) => {
    try {
        const session = await GroupSession.findById(req.params.id)
            .populate("mentor", "name")
            .populate("createdBy", "name")
            .populate("participants.student", "name");

        if (!session) {
            return res.status(404).json({ msg: "Group session not found" });
        }

        res.json({ session });
    } catch (error) {
        console.error("getGroupSessionById error:", error);
        res.status(500).json({ msg: "Failed to fetch group session" });
    }
};

// ── Mentor: Get all pending payment verifications ──
exports.getPendingPayments = async (req, res) => {
    try {
        if (!ensureTeacher(req, res)) return;

        const sessions = await GroupSession.find({
            mentor: req.user.id,
            "participants.paymentStatus": "sent",
        })
            .populate("participants.student", "name email")
            .sort({ createdAt: -1 });

        // Flatten into a list of payment items
        const payments = [];
        sessions.forEach((session) => {
            session.participants
                .filter((p) => p.paymentStatus === "sent")
                .forEach((p) => {
                    payments.push({
                        sessionId: session._id,
                        topic: session.topic,
                        dateLabel: session.dateLabel,
                        timeSlot: session.timeSlot,
                        rate: session.rate,
                        sessionStatus: session.status,
                        studentId: p.student?._id || p.student,
                        studentName: p.studentName,
                        paymentStatus: p.paymentStatus,
                        joinedAt: p.joinedAt,
                        type: "group"
                    });
                });
        });

        // 1-1 Mentorship Sessions awaiting payment
        const MentorshipSession = require("../models/MentorshipSession");
        const MentorProfile = require("../models/MentorProfile");

        const oneOnOneSessions = await MentorshipSession.find({
            mentor: req.user.id,
            paymentStatus: "sent",
        }).sort({ createdAt: -1 });

        const mentorProfile = await MentorProfile.findOne({ mentor: req.user.id });
        const hourlyRate = mentorProfile?.hourlyRate || 0;

        oneOnOneSessions.forEach((session) => {
            payments.push({
                sessionId: session._id,
                topic: `1-1 Session: ${session.subject}`,
                dateLabel: session.dateLabel,
                timeSlot: session.timeSlot,
                rate: hourlyRate,
                sessionStatus: session.status,
                studentId: session.student,
                studentName: session.studentName,
                paymentStatus: session.paymentStatus,
                joinedAt: session.updatedAt,
                type: "1-1"
            });
        });

        res.json({ payments });
    } catch (error) {
        console.error("getPendingPayments error:", error);
        res.status(500).json({ msg: "Failed to fetch pending payments" });
    }
};

// ── Mentor: Get all group sessions (scheduled/completed) ──
exports.getGroupSessionsForMentor = async (req, res) => {
    try {
        if (!ensureTeacher(req, res)) return;

        const sessions = await GroupSession.find({
            mentor: req.user.id,
        })
            .populate("createdBy", "name")
            .populate("participants.student", "name")
            .sort({ createdAt: -1 });

        res.json({ sessions });
    } catch (error) {
        console.error("getGroupSessionsForMentor error:", error);
        res.status(500).json({ msg: "Failed to fetch group sessions" });
    }
};

// ── Mentor: Accept a student's join request ──
exports.acceptJoinRequest = async (req, res) => {
    try {
        if (!ensureTeacher(req, res)) return;

        const { studentId } = req.body;
        if (!studentId) {
            return res.status(400).json({ msg: "studentId is required" });
        }

        const session = await GroupSession.findOne({
            _id: req.params.id,
            mentor: req.user.id,
            status: "scheduled",
        });

        if (!session) {
            return res.status(404).json({ msg: "Group session not found" });
        }

        const participant = (session.participants || []).find(
            (p) => String(p.student) === String(studentId)
        );

        if (!participant) {
            return res.status(404).json({ msg: "Participant not found" });
        }

        if (participant.paymentStatus !== "pending") {
            return res.status(400).json({ msg: "Join request is not pending" });
        }

        participant.paymentStatus = "accepted";
        await session.save();

        await createNotification(
            studentId,
            "Join Request Accepted — Complete Payment",
            `Your request to join "${session.topic}" has been accepted! Please complete the payment to verify your seat.`,
            "group_session_status",
            "/mentorship"
        );

        res.json({ session });
    } catch (error) {
        console.error("acceptJoinRequest error:", error);
        res.status(500).json({ msg: "Failed to accept join request" });
    }
};

// ── Mentor: Decline a student's join request ──
exports.declineJoinRequest = async (req, res) => {
    try {
        if (!ensureTeacher(req, res)) return;

        const { studentId } = req.body;
        if (!studentId) {
            return res.status(400).json({ msg: "studentId is required" });
        }

        const session = await GroupSession.findOne({
            _id: req.params.id,
            mentor: req.user.id,
            status: "scheduled",
        });

        if (!session) {
            return res.status(404).json({ msg: "Group session not found" });
        }

        const participantIndex = (session.participants || []).findIndex(
            (p) => String(p.student) === String(studentId)
        );

        if (participantIndex === -1) {
            return res.status(404).json({ msg: "Participant not found" });
        }

        session.participants.splice(participantIndex, 1);
        await session.save();

        await createNotification(
            studentId,
            "Join Request Declined",
            `Your request to join "${session.topic}" has been declined by the mentor.`,
            "group_session_status",
            "/mentorship"
        );

        res.json({ session });
    } catch (error) {
        console.error("declineJoinRequest error:", error);
        res.status(500).json({ msg: "Failed to decline join request" });
    }
};
