const express = require('express');
const mongoose = require('mongoose');
const User = require('../models/User');
const TeamMembership = require('../models/TeamMembership');
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
            profilePicture: user.profilePicture,
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
            profilePicture: user.profilePicture,
            isEmailVerified: user.isEmailVerified,
            createdAt: user.createdAt,
            updatedAt: user.updatedAt,
        });
    } catch (err) {
        console.error('Update me error:', err);
        res.status(500).json({ message: 'Server error' });
    }
});

// GET /api/users/search?q=<query>&teamId=<teamId>
router.get('/search', auth, async (req, res) => {
  try {
    const q = req.query.q?.trim();
    const teamId = req.query.teamId?.trim();

    if (!q || q.length < 2) {
      return res.json([]);
    }

    const escaped = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(escaped, 'i');

    let users = await User.find({
      _id: { $ne: req.user.id },
      $or: [{ username: regex }, { email: regex }],
    })
      .select('_id username')
      .limit(10);

    if (teamId && mongoose.Types.ObjectId.isValid(teamId)) {
      const taken = await TeamMembership.find({
        team: teamId,
        status: { $in: ['active', 'invited'] },
      }).select('user');
      const takenSet = new Set(taken.map((m) => m.user.toString()));
      users = users.filter((u) => !takenSet.has(u._id.toString()));
    }

    return res.json(users.slice(0, 5));
  } catch (err) {
    console.error('User search error:', err);
    return res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;