const express = require('express');
const mongoose = require('mongoose');

const auth = require('../middleware/authMiddleware');
const Match = require('../models/Match');
const TeamMembership = require('../models/TeamMembership');

const router = express.Router();

router.get('/:matchId', auth, async (req, res) => {
  try {
    const { matchId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(matchId)) {
      return res.status(400).json({ message: 'Invalid match id' });
    }

    const match = await Match.findById(matchId).populate('team', 'name');
    if (!match) {
      return res.status(404).json({ message: 'Match not found' });
    }

    const membership = await TeamMembership.findOne({
      team: match.team,
      user: req.user.id,
      status: 'active',
    });

    if (!membership) {
      return res.status(403).json({ message: 'Access denied' });
    }

    return res.json(match);
  } catch (err) {
    console.error('Get match error:', err);
    return res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
