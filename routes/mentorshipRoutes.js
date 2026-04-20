const express = require("express");
const jwt = require("jsonwebtoken");
const {
    getMyMentorProfile,
    upsertMyMentorProfile,
    getMyAvailability,
    getAvailabilityByMentorName,
    updateMyAvailability,
    listMentorsForStudents,
    createSessionRequest,
    getSessionRequestsForMentor,
    acceptSessionRequest,
    declineSessionRequest,
    getUpcomingSessionsForMentor,
    getUpcomingSessionsForStudent,
    isMentorBusy,
} = require("../controllers/mentorshipController");

const router = express.Router();

const authMiddleware = (req, res, next) => {
    const token = req.headers.authorization?.split(" ")[1];
    if (!token) return res.status(401).json({ msg: "No token provided" });

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.user = decoded;
        next();
    } catch (error) {
        return res.status(401).json({ msg: "Invalid token" });
    }
};

router.get("/mentors", authMiddleware, listMentorsForStudents);
router.get("/mentor-profile/me", authMiddleware, getMyMentorProfile);
router.put("/mentor-profile/me", authMiddleware, upsertMyMentorProfile);
router.get("/availability/me", authMiddleware, getMyAvailability);
router.get("/availability/by-mentor", authMiddleware, getAvailabilityByMentorName);
router.put("/availability/me", authMiddleware, updateMyAvailability);
router.get("/busy", authMiddleware, isMentorBusy);

router.post("/requests", authMiddleware, createSessionRequest);
router.get("/requests/mentor", authMiddleware, getSessionRequestsForMentor);
router.patch("/requests/:requestId/accept", authMiddleware, acceptSessionRequest);
router.patch("/requests/:requestId/decline", authMiddleware, declineSessionRequest);

router.get("/sessions/upcoming/mentor", authMiddleware, getUpcomingSessionsForMentor);
router.get("/sessions/upcoming/student", authMiddleware, getUpcomingSessionsForStudent);

module.exports = router;
