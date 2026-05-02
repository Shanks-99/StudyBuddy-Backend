const MentorshipSession = require("../models/MentorshipSession");
const { createNotification } = require("../controllers/notificationController");
const User = require("../models/User");
const Notification = require("../models/Notification");

// Convert dateLabel ("January 15, 2026") and timeSlot ("10:00 AM") to Date object
function getSessionStartDateTime(dateLabel, timeSlot) {
    if (!dateLabel || !timeSlot) return null;
    try {
        const dateStr = `${dateLabel} ${timeSlot}`;
        const date = new Date(dateStr);
        if (isNaN(date.getTime())) return null;
        return date;
    } catch (e) {
        return null;
    }
}

// Runs every 5 minutes to check for sessions starting in the next 10 minutes
const checkUpcomingSessions = async () => {
    try {
        const now = new Date();
        const tenMinutesFromNow = new Date(now.getTime() + 10 * 60000);

        // We only care about accepted sessions
        const upcomingSessions = await MentorshipSession.find({ status: "accepted" });

        for (const session of upcomingSessions) {
            const startTime = getSessionStartDateTime(session.dateLabel, session.timeSlot);
            if (!startTime) continue;

            // If session starts between now and 15 minutes from now
            if (startTime > now && startTime <= new Date(now.getTime() + 15 * 60000)) {
                // Find mentor
                const mentor = await User.findOne({ name: session.mentorName });
                if (!mentor) continue;

                // Check if notification already exists for this session
                const existingMentorNotification = await Notification.findOne({
                    recipient: mentor._id,
                    type: "session_reminder",
                    message: { $regex: session._id.toString() } // store session ID in message or link implicitly
                });

                if (!existingMentorNotification) {
                    await createNotification(
                        mentor._id,
                        "Session Starting Soon",
                        `Your session with ${session.studentName} for ${session.subject} starts in less than 15 minutes! [SessionId:${session._id}]`,
                        "session_reminder",
                        "/instructor-dashboard"
                    );
                }

                // Find student
                if (session.student) {
                    const existingStudentNotification = await Notification.findOne({
                        recipient: session.student,
                        type: "session_reminder",
                        message: { $regex: session._id.toString() }
                    });

                    if (!existingStudentNotification) {
                        await createNotification(
                            session.student,
                            "Session Starting Soon",
                            `Your session with ${session.mentorName} for ${session.subject} starts in less than 15 minutes! [SessionId:${session._id}]`,
                            "session_reminder",
                            "/student-dashboard"
                        );
                    }
                }
            }
        }
    } catch (error) {
        console.error("Error in session reminder job:", error);
    }
};

const startJob = () => {
    // Run immediately, then every 5 minutes
    checkUpcomingSessions();
    setInterval(checkUpcomingSessions, 5 * 60 * 1000);
    console.log("Session reminder background job started.");
};

module.exports = { startJob };
