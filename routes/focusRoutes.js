const express = require("express");
const router = express.Router();
const { saveSession, getSessions } = require("../controllers/focusController");

// The base route is /api/focus
router.post("/save", saveSession);
router.get("/:userId", getSessions);

module.exports = router;
