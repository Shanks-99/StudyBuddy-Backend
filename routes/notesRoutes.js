const express = require("express");
const { generateNotes } = require("../controllers/notesController");

const router = express.Router();

// Single route for note generation
router.post("/generate", generateNotes);

module.exports = router;
