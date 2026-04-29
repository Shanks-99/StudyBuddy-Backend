const express = require('express');
const router = express.Router();
const protect = require('../middleware/authMiddleware');
const { getNotifications, markAsRead, clearAll } = require('../controllers/notificationController');

router.get('/', protect, getNotifications);
router.put('/:id/read', protect, markAsRead);
router.delete('/clear', protect, clearAll);

module.exports = router;
