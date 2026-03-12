const express = require("express");
const router = express.Router();
const { createRoom, getRooms, getMessages, getRoomById, deleteRoom } = require("../controllers/studyRoomController");

// The base route is /api/studyrooms
router.post("/", createRoom);
router.get("/", getRooms);
router.get("/:roomId", getRoomById);
router.delete("/:roomId", deleteRoom);
router.get("/:roomId/messages", getMessages);

module.exports = router;
