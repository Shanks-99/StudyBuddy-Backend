const express = require('express');
const router = express.Router();
const protect = require('../middleware/authMiddleware');
const { getNotifications, markAsRead, clearAll, markAllAsRead } = require('../controllers/notificationController');

router.get('/', protect, getNotifications);
router.put('/:id/read', protect, markAsRead);
router.put('/mark-all-read', protect, markAllAsRead);
router.delete('/clear', protect, clearAll);

module.exports = router;
