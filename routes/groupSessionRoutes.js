const express = require("express");
const jwt = require("jsonwebtoken");
const {
    createGroupSessionRequest,
    getGroupRequestsForMentor,
    acceptGroupRequest,
    declineGroupRequest,
    markPaymentSent,
    verifyPayment,
    rejectPayment,
    getGroupSessionsForStudent,
    joinGroupSession,
    joinPaymentSent,
    verifyJoinPayment,
    rejectJoinPayment,
    getGroupSessionById,
    getPendingPayments,
    getGroupSessionsForMentor,
    acceptJoinRequest,
    declineJoinRequest,
} = require("../controllers/groupSessionController");

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

// Student endpoints
router.post("/", authMiddleware, createGroupSessionRequest);
router.get("/student", authMiddleware, getGroupSessionsForStudent);
router.patch("/:id/payment-sent", authMiddleware, markPaymentSent);
router.post("/:id/join", authMiddleware, joinGroupSession);
router.patch("/:id/join-payment-sent", authMiddleware, joinPaymentSent);

// Mentor endpoints
router.get("/mentor", authMiddleware, getGroupRequestsForMentor);
router.get("/mentor/all", authMiddleware, getGroupSessionsForMentor);
router.get("/mentor/payments", authMiddleware, getPendingPayments);
router.patch("/:id/accept", authMiddleware, acceptGroupRequest);
router.patch("/:id/decline", authMiddleware, declineGroupRequest);
router.patch("/:id/verify-payment", authMiddleware, verifyPayment);
router.patch("/:id/reject-payment", authMiddleware, rejectPayment);
router.patch("/:id/verify-join-payment", authMiddleware, verifyJoinPayment);
router.patch("/:id/reject-join-payment", authMiddleware, rejectJoinPayment);
router.patch("/:id/accept-join-request", authMiddleware, acceptJoinRequest);
router.patch("/:id/decline-join-request", authMiddleware, declineJoinRequest);

// Shared
router.get("/:id", authMiddleware, getGroupSessionById);

module.exports = router;
