const express = require("express");
const router = express.Router();
const {
    createRoom,
    getRooms,
    getRoomById,
    joinRoom,
    leaveRoom,
    completeRoom,
    getMessages,
    syncNotes,
    syncTodos
} = require("../controllers/studyBuddyController");

router.post("/", createRoom);
router.get("/", getRooms);
router.get("/:roomId", getRoomById);
router.put("/join/:roomId", joinRoom);
router.put("/leave/:roomId", leaveRoom);
router.put("/complete/:roomId", completeRoom);
router.get("/:roomId/messages", getMessages);
router.put("/:roomId/notes", syncNotes);
router.put("/:roomId/todos", syncTodos);

module.exports = router;
