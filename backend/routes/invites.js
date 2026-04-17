const express = require('express');
const mongoose = require('mongoose');

const auth = require('../middleware/authMiddleware');
const TeamMembership = require('../models/TeamMembership');

const router = express.Router();
const INVITE_APPROVER_ROLES = ['owner', 'coach'];

router.get('/', auth, async (req, res) => {
  try {
    const invites = await TeamMembership.find({
      user: req.user.id,
      status: 'invited',
    })
      .populate('team', 'name inviteCode')
      .sort({ createdAt: -1 });

    const payload = invites
      .filter((invite) => invite.team)
      .map((invite) => ({
        _id: invite._id,
        role: invite.role,
        createdAt: invite.createdAt,
        team: invite.team,
      }));

    return res.json(payload);
  } catch (err) {
    console.error('List invites error:', err);
    return res.status(500).json({ message: 'Server error' });
  }
});

router.post('/:inviteId/respond', auth, async (req, res) => {
  try {
    const { inviteId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(inviteId)) {
      return res.status(400).json({ message: 'Invalid invite id' });
    }

    const action = req.body?.action;
    if (!['accept', 'decline'].includes(action)) {
      return res.status(400).json({ message: 'Invalid action' });
    }

    const invite = await TeamMembership.findOne({
      _id: inviteId,
      user: req.user.id,
      status: 'invited',
    });

    if (!invite) {
      return res.status(404).json({ message: 'Invite not found' });
    }

    if (action === 'accept') {
      if (INVITE_APPROVER_ROLES.includes(invite.invitedByRole)) {
        invite.status = 'active';
      } else {
        invite.status = 'requested';
        invite.role = 'player';
      }
    } else {
      invite.status = 'removed';
    }

    await invite.save();

    if (action === 'accept' && invite.status === 'requested') {
      return res.json({
        message: 'Join request sent. A coach or owner must approve before you can join.',
      });
    }

    return res.json({ message: action === 'accept' ? 'Invite accepted' : 'Invite declined' });
  } catch (err) {
    console.error('Respond invite error:', err);
    return res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
