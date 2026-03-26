const express = require('express');
const User = require('../models/User');
const auth = require('../middleware/authMiddleware');

const router = express.Router();

// GET /api/users/me
router.get('/me', auth, async(req, res) => {
    try {
        const user = await User.findById(req.user.id).select('-passwordHash');
        if(!user) {
            return res.status(401).json({ message: 'User not found' });
        }

        res.json({
            _id: user._id,
            username: user.username,
            email: user.email,
            isEmailVerified: user.isEmailVerified,
            createdAt: user.createdAt,
            updatedAt: user.updatedAt,
        });
    } catch (err) {
        console.error('Get me error:', err);
        res.status(500).json({ message: 'Server error'});
    }
});

// PATCH /api/users/me
router.patch('/me', auth, async (req, res) => {
    try {
        const user = await User.findById(req.user.id);
        if (!user) {
            return res.status(401).json({ message: 'User not found' });
        }

        const nextUsername = req.body?.username?.trim();
        const nextEmail = req.body?.email?.trim().toLowerCase();

        if (nextUsername) {
            const existingUsername = await User.findOne({
                username: nextUsername,
                _id: { $ne: user._id }
            });

            if (existingUsername) {
                return res.status(409).json({ message: 'Username already in use' });
            }

            user.username = nextUsername;
        }

        if (nextEmail) {
            const existingEmail = await User.findOne({
                email: nextEmail,
                _id: { $ne: user._id }
            });

            if (existingEmail) {
                return res.status(409).json({ message: 'Email already in use' });
            }

            user.email = nextEmail;
        }

        await user.save();

        res.json({
            _id: user._id,
            username: user.username,
            email: user.email,
            isEmailVerified: user.isEmailVerified,
            createdAt: user.createdAt,
            updatedAt: user.updatedAt,
        });
    } catch (err) {
        console.error('Update me error:', err);
        res.status(500).json({ message: 'Server error' });
    }
});

module.exports = router;