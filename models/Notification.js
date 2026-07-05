const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema({
    recipient: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    title: {
        type: String,
        required: true
    },
    message: {
        type: String,
        required: true
    },
    type: {
        type: String,
        enum: ['mentorship_request', 'mentorship_status', 'session_reminder', 'system', 'group_session_request', 'group_session_status', 'group_payment_verification', 'group_session_join'],
        default: 'system'
    },
    link: {
        type: String,
        default: null
    },
    isRead: {
        type: Boolean,
        default: false
    }
}, { timestamps: true });

module.exports = mongoose.model('Notification', notificationSchema);
