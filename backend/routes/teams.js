const express = require('express');
const mongoose = require('mongoose');

const auth = require('../middleware/authMiddleware');
const Team = require('../models/Team');
const TeamMembership = require('../models/TeamMembership');
const User = require('../models/User');
const Kid = require('../models/Kid');
const Match = require('../models/Match');

const router = express.Router();

const isValidObjectId = (value) => mongoose.Types.ObjectId.isValid(value);

async function getActiveMembership(teamId, userId) {
  return TeamMembership.findOne({
    team: teamId,
    user: userId,
    status: 'active',
  });
}

async function generateInviteCode() {
  let inviteCode = '';
  let exists = true;

  while (exists) {
    const randomSegment = Math.random().toString(36).slice(2, 8).toUpperCase();
    inviteCode = `TEAM-${randomSegment}`;
    const existingTeam = await Team.findOne({ inviteCode });
    exists = !!existingTeam;
  }

  return inviteCode;
}

router.post('/', auth, async (req, res) => {
  try {
    const name = req.body?.name?.trim();
    if (!name) {
      return res.status(400).json({ message: 'Team name is required' });
    }

    const inviteCode = await generateInviteCode();

    const team = await Team.create({
      name,
      inviteCode,
      createdBy: req.user.id,
    });

    await TeamMembership.create({
      team: team._id,
      user: req.user.id,
      role: 'owner',
      status: 'active',
    });

    return res.status(201).json(team);
  } catch (err) {
    console.error('Create team error:', err);
    return res.status(500).json({ message: 'Server error' });
  }
});

router.get('/', auth, async (req, res) => {
  try {
    const memberships = await TeamMembership.find({
      user: req.user.id,
      status: 'active',
    }).populate('team');

    const teams = memberships
      .filter((membership) => membership.team)
      .map((membership) => ({
        ...membership.team.toObject(),
        membershipRole: membership.role,
      }));

    return res.json(teams);
  } catch (err) {
    console.error('List teams error:', err);
    return res.status(500).json({ message: 'Server error' });
  }
});

router.post('/join', auth, async (req, res) => {
  try {
    const inviteCode = req.body?.inviteCode?.trim()?.toUpperCase();
    if (!inviteCode) {
      return res.status(400).json({ message: 'Invite code is required' });
    }

    const team = await Team.findOne({ inviteCode });
    if (!team) {
      return res.status(404).json({ message: 'Invite code not found' });
    }

    const existingMembership = await TeamMembership.findOne({
      team: team._id,
      user: req.user.id,
    });

    if (existingMembership?.status === 'active') {
      return res.json({ message: 'Already a member of this team', team });
    }

    if (existingMembership) {
      existingMembership.status = 'active';
      await existingMembership.save();
      return res.json({ message: 'Joined team successfully', team });
    }

    await TeamMembership.create({
      team: team._id,
      user: req.user.id,
      role: 'parent',
      status: 'active',
    });

    return res.status(201).json({ message: 'Joined team successfully', team });
  } catch (err) {
    console.error('Join team error:', err);
    return res.status(500).json({ message: 'Server error' });
  }
});

router.post('/:teamId/invites', auth, async (req, res) => {
  try {
    const { teamId } = req.params;
    if (!isValidObjectId(teamId)) {
      return res.status(400).json({ message: 'Invalid team id' });
    }

    const inviterMembership = await getActiveMembership(teamId, req.user.id);
    if (!inviterMembership) {
      return res.status(403).json({ message: 'Only team members can invite users' });
    }

    const username = req.body?.username?.trim();
    if (!username) {
      return res.status(400).json({ message: 'Username is required' });
    }

    const invitee = await User.findOne({ username });
    if (!invitee) {
      return res.status(404).json({ message: 'User not found' });
    }

    const existingMembership = await TeamMembership.findOne({
      team: teamId,
      user: invitee._id,
    });

    if (existingMembership?.status === 'active') {
      return res.status(409).json({ message: 'User is already a team member' });
    }

    if (existingMembership?.status === 'invited') {
      return res.status(409).json({ message: 'User already has a pending invite' });
    }

    if (existingMembership) {
      existingMembership.status = 'invited';
      existingMembership.role = req.body?.role || 'parent';
      await existingMembership.save();
      return res.status(201).json({ message: 'Invite sent' });
    }

    await TeamMembership.create({
      team: teamId,
      user: invitee._id,
      role: req.body?.role || 'parent',
      status: 'invited',
    });

    return res.status(201).json({ message: 'Invite sent' });
  } catch (err) {
    console.error('Create invite error:', err);
    return res.status(500).json({ message: 'Server error' });
  }
});

router.get('/:teamId', auth, async (req, res) => {
  try {
    const { teamId } = req.params;
    if (!isValidObjectId(teamId)) {
      return res.status(400).json({ message: 'Invalid team id' });
    }

    const membership = await getActiveMembership(teamId, req.user.id);
    if (!membership) {
      return res.status(403).json({ message: 'Access denied' });
    }

    const team = await Team.findById(teamId);
    if (!team) {
      return res.status(404).json({ message: 'Team not found' });
    }

    return res.json({ ...team.toObject(), membershipRole: membership.role });
  } catch (err) {
    console.error('Get team error:', err);
    return res.status(500).json({ message: 'Server error' });
  }
});

router.patch('/:teamId', auth, async (req, res) => {
  try {
    const { teamId } = req.params;
    if (!isValidObjectId(teamId)) {
      return res.status(400).json({ message: 'Invalid team id' });
    }

    const membership = await getActiveMembership(teamId, req.user.id);
    if (!membership) {
      return res.status(403).json({ message: 'Access denied' });
    }

    const name = req.body?.name?.trim();
    if (!name) {
      return res.status(400).json({ message: 'Team name is required' });
    }

    const team = await Team.findById(teamId);
    if (!team) {
      return res.status(404).json({ message: 'Team not found' });
    }

    team.name = name;
    await team.save();

    return res.json(team);
  } catch (err) {
    console.error('Update team error:', err);
    return res.status(500).json({ message: 'Server error' });
  }
});

router.delete('/:teamId', auth, async (req, res) => {
  try {
    const { teamId } = req.params;
    if (!isValidObjectId(teamId)) {
      return res.status(400).json({ message: 'Invalid team id' });
    }

    const membership = await getActiveMembership(teamId, req.user.id);
    if (!membership || membership.role !== 'owner') {
      return res.status(403).json({ message: 'Only the team owner can delete this team' });
    }

    const team = await Team.findById(teamId);
    if (!team) {
      return res.status(404).json({ message: 'Team not found' });
    }

    await Promise.all([
      Match.deleteMany({ team: teamId }),
      Kid.deleteMany({ team: teamId }),
      TeamMembership.deleteMany({ team: teamId }),
      Team.deleteOne({ _id: teamId }),
    ]);

    return res.json({ message: 'Team deleted successfully' });
  } catch (err) {
    console.error('Delete team error:', err);
    return res.status(500).json({ message: 'Server error' });
  }
});

router.post('/:teamId/matches', auth, async (req, res) => {
  try {
    const { teamId } = req.params;
    if (!isValidObjectId(teamId)) {
      return res.status(400).json({ message: 'Invalid team id' });
    }

    const membership = await getActiveMembership(teamId, req.user.id);
    if (!membership) {
      return res.status(403).json({ message: 'Access denied' });
    }

    const opponent = req.body?.opponent?.trim();
    const date = req.body?.date;

    if (!opponent || !date) {
      return res.status(400).json({ message: 'Opponent and date are required' });
    }

    const parsedDate = new Date(date);
    if (Number.isNaN(parsedDate.getTime())) {
      return res.status(400).json({ message: 'Invalid date' });
    }

    const match = await Match.create({
      team: teamId,
      opponent,
      date: parsedDate,
      location: req.body?.location?.trim() || '',
      notes: req.body?.notes?.trim() || '',
      createdBy: req.user.id,
    });

    return res.status(201).json(match);
  } catch (err) {
    console.error('Create match error:', err);
    return res.status(500).json({ message: 'Server error' });
  }
});

router.get('/:teamId/matches', auth, async (req, res) => {
  try {
    const { teamId } = req.params;
    if (!isValidObjectId(teamId)) {
      return res.status(400).json({ message: 'Invalid team id' });
    }

    const membership = await getActiveMembership(teamId, req.user.id);
    if (!membership) {
      return res.status(403).json({ message: 'Access denied' });
    }

    const matches = await Match.find({ team: teamId }).sort({ date: -1, createdAt: -1 });
    return res.json(matches);
  } catch (err) {
    console.error('List matches error:', err);
    return res.status(500).json({ message: 'Server error' });
  }
});

router.post('/:teamId/kids', auth, async (req, res) => {
  try {
    const { teamId } = req.params;
    if (!isValidObjectId(teamId)) {
      return res.status(400).json({ message: 'Invalid team id' });
    }

    const membership = await getActiveMembership(teamId, req.user.id);
    if (!membership) {
      return res.status(403).json({ message: 'Access denied' });
    }

    const name = req.body?.name?.trim();
    if (!name) {
      return res.status(400).json({ message: 'Child name is required' });
    }

    const kid = await Kid.create({
      name,
      ageGroup: req.body?.ageGroup?.trim() || '',
      team: teamId,
      guardianUser: req.user.id,
      createdBy: req.user.id,
    });

    return res.status(201).json(kid);
  } catch (err) {
    console.error('Create kid error:', err);
    return res.status(500).json({ message: 'Server error' });
  }
});

router.get('/:teamId/kids', auth, async (req, res) => {
  try {
    const { teamId } = req.params;
    if (!isValidObjectId(teamId)) {
      return res.status(400).json({ message: 'Invalid team id' });
    }

    const membership = await getActiveMembership(teamId, req.user.id);
    if (!membership) {
      return res.status(403).json({ message: 'Access denied' });
    }

    const kids = await Kid.find({ team: teamId }).sort({ createdAt: -1 });
    return res.json(kids);
  } catch (err) {
    console.error('List kids error:', err);
    return res.status(500).json({ message: 'Server error' });
  }
});

router.patch('/:teamId/kids/:kidId', auth, async (req, res) => {
  try {
    const { teamId, kidId } = req.params;
    if (!isValidObjectId(teamId) || !isValidObjectId(kidId)) {
      return res.status(400).json({ message: 'Invalid id' });
    }

    const membership = await getActiveMembership(teamId, req.user.id);
    if (!membership) {
      return res.status(403).json({ message: 'Access denied' });
    }

    const kid = await Kid.findOne({ _id: kidId, team: teamId });
    if (!kid) {
      return res.status(404).json({ message: 'Kid not found' });
    }

    const nextName = req.body?.name?.trim();
    const nextAgeGroup = req.body?.ageGroup?.trim();

    if (nextName) {
      kid.name = nextName;
    }

    if (nextAgeGroup !== undefined) {
      kid.ageGroup = nextAgeGroup;
    }

    await kid.save();
    return res.json(kid);
  } catch (err) {
    console.error('Update kid error:', err);
    return res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
