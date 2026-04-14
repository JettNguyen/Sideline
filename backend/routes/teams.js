const express = require('express');
const mongoose = require('mongoose');

const auth = require('../middleware/authMiddleware');
const Team = require('../models/Team');
const TeamMembership = require('../models/TeamMembership');
const User = require('../models/User');
const Kid = require('../models/Kid');
const Match = require('../models/Match');
const Video = require('../models/Video');
const { DeleteObjectCommand } = require('@aws-sdk/client-s3');
const s3 = require('../config/s3');

const router = express.Router();

const isValidObjectId = (value) => mongoose.Types.ObjectId.isValid(value);
const TEAM_ASSIGNABLE_ROLES = ['coach', 'parent', 'player'];

const normalizeRole = (role) => {
  if (!role || typeof role !== 'string') return null;
  const normalized = role.trim().toLowerCase();
  return TEAM_ASSIGNABLE_ROLES.includes(normalized) ? normalized : null;
};

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

    if (existingMembership?.status === 'requested') {
      return res.status(409).json({ message: 'Join request already pending' });
    }

    if (existingMembership?.status === 'invited') {
      existingMembership.status = 'active';
      await existingMembership.save();
      return res.json({ message: 'Joined team successfully', team });
    }

    if (existingMembership) {
      existingMembership.status = 'requested';
      existingMembership.role = 'player';
      await existingMembership.save();
      return res.status(201).json({
        message: 'Join request sent. A coach or owner must assign your role before you can join.',
      });
    }

    await TeamMembership.create({
      team: team._id,
      user: req.user.id,
      role: 'player',
      status: 'requested',
    });

    return res.status(201).json({
      message: 'Join request sent. A coach or owner must assign your role before you can join.',
    });
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
    if (!inviterMembership || !['owner', 'coach'].includes(inviterMembership.role)) {
      return res.status(403).json({ message: 'Only owners and coaches can invite users' });
    }

    const roleToAssign = normalizeRole(req.body?.role);
    if (!roleToAssign) {
      return res.status(400).json({ message: 'A valid role is required (coach, parent, player)' });
    }
    if (inviterMembership.role === 'coach' && roleToAssign === 'coach') {
      return res.status(403).json({ message: 'Coaches cannot assign coach role' });
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
      existingMembership.role = roleToAssign;
      await existingMembership.save();
      return res.status(201).json({ message: 'Invite sent' });
    }

    await TeamMembership.create({
      team: teamId,
      user: invitee._id,
      role: roleToAssign,
      status: 'invited',
    });

    return res.status(201).json({ message: 'Invite sent' });
  } catch (err) {
    console.error('Create invite error:', err);
    return res.status(500).json({ message: 'Server error' });
  }
});

router.get('/search', auth, async (req, res) => {
  try {
    const q = req.query.q?.trim();
    if (!q || q.length < 2) {
      return res.json([]);
    }

    const escaped = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(escaped, 'i');

    const teams = await Team.find({
      isPublic: true,
      isArchived: { $ne: true },
      $or: [{ name: regex }, { location: regex }],
    })
      .select('_id name location')
      .limit(20);

    const teamIds = teams.map((t) => t._id);

    const memberCounts = await TeamMembership.aggregate([
      { $match: { team: { $in: teamIds }, status: 'active' } },
      { $group: { _id: '$team', count: { $sum: 1 } } },
    ]);

    const countMap = {};
    memberCounts.forEach((m) => { countMap[m._id.toString()] = m.count; });

    const myMemberships = await TeamMembership.find({
      team: { $in: teamIds },
      user: req.user.id,
    }).select('team status');

    const myStatusMap = {};
    myMemberships.forEach((m) => { myStatusMap[m.team.toString()] = m.status; });

    const result = teams.map((team) => ({
      _id: team._id,
      name: team.name,
      location: team.location,
      memberCount: countMap[team._id.toString()] || 0,
      myStatus: myStatusMap[team._id.toString()] || null,
    }));

    return res.json(result);
  } catch (err) {
    console.error('Team search error:', err);
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
    if (!membership || !['owner', 'coach'].includes(membership.role)) {
      return res.status(403).json({ message: 'Only owners and coaches can edit team settings' });
    }

    const team = await Team.findById(teamId);
    if (!team) {
      return res.status(404).json({ message: 'Team not found' });
    }

    const name = req.body?.name?.trim();
    if (name !== undefined) {
      if (!name) return res.status(400).json({ message: 'Team name is required' });
      team.name = name;
    }

    if (req.body?.location !== undefined) {
      team.location = req.body.location?.trim() || '';
    }

    if (req.body?.isPublic !== undefined) {
      team.isPublic = !!req.body.isPublic;
    }

    await team.save();
    return res.json({ ...team.toObject(), membershipRole: membership.role });
  } catch (err) {
    console.error('Update team error:', err);
    return res.status(500).json({ message: 'Server error' });
  }
});

router.post('/:teamId/requests', auth, async (req, res) => {
  try {
    const { teamId } = req.params;
    if (!isValidObjectId(teamId)) {
      return res.status(400).json({ message: 'Invalid team id' });
    }

    const team = await Team.findById(teamId);
    if (!team || !team.isPublic) {
      return res.status(404).json({ message: 'Team not found' });
    }

    const existing = await TeamMembership.findOne({ team: teamId, user: req.user.id });
    if (existing?.status === 'active') {
      return res.status(409).json({ message: 'Already a member' });
    }
    if (existing?.status === 'requested') {
      return res.status(409).json({ message: 'Request already pending' });
    }
    if (existing?.status === 'invited') {
      return res.status(409).json({ message: 'You already have a pending invite' });
    }

    if (existing) {
      existing.status = 'requested';
      existing.role = 'player';
      await existing.save();
    } else {
      await TeamMembership.create({
        team: teamId,
        user: req.user.id,
        role: 'player',
        status: 'requested',
      });
    }

    return res.status(201).json({ message: 'Request sent' });
  } catch (err) {
    console.error('Join request error:', err);
    return res.status(500).json({ message: 'Server error' });
  }
});

router.get('/:teamId/requests', auth, async (req, res) => {
  try {
    const { teamId } = req.params;
    if (!isValidObjectId(teamId)) {
      return res.status(400).json({ message: 'Invalid team id' });
    }

    const membership = await getActiveMembership(teamId, req.user.id);
    if (!membership || !['owner', 'coach'].includes(membership.role)) {
      return res.status(403).json({ message: 'Access denied' });
    }

    const requests = await TeamMembership.find({ team: teamId, status: 'requested' })
      .populate('user', 'username email profilePicture')
      .sort({ createdAt: -1 });

    return res.json(requests);
  } catch (err) {
    console.error('List requests error:', err);
    return res.status(500).json({ message: 'Server error' });
  }
});

router.patch('/:teamId/requests/:userId', auth, async (req, res) => {
  try {
    const { teamId, userId } = req.params;
    if (!isValidObjectId(teamId) || !isValidObjectId(userId)) {
      return res.status(400).json({ message: 'Invalid id' });
    }

    const membership = await getActiveMembership(teamId, req.user.id);
    if (!membership || !['owner', 'coach'].includes(membership.role)) {
      return res.status(403).json({ message: 'Access denied' });
    }

    const { action } = req.body;
    if (!['accept', 'deny'].includes(action)) {
      return res.status(400).json({ message: 'action must be accept or deny' });
    }

    const request = await TeamMembership.findOne({ team: teamId, user: userId, status: 'requested' });
    if (!request) {
      return res.status(404).json({ message: 'Request not found' });
    }

    if (action === 'accept') {
      const roleToAssign = normalizeRole(req.body?.role);
      if (!roleToAssign) {
        return res.status(400).json({ message: 'A valid role is required to accept a request' });
      }
      if (membership.role === 'coach' && roleToAssign === 'coach') {
        return res.status(403).json({ message: 'Coaches cannot assign coach role' });
      }

      request.status = 'active';
      request.role = roleToAssign;
      await request.save();
      return res.json({ message: 'Request accepted' });
    } else {
      request.status = 'removed';
      await request.save();
      return res.json({ message: 'Request denied' });
    }
  } catch (err) {
    console.error('Handle request error:', err);
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

    const kids = await Kid.find({ team: teamId, guardianUser: req.user.id }).sort({ createdAt: -1 });
    return res.json(kids);
  } catch (err) {
    console.error('List kids error:', err);
    return res.status(500).json({ message: 'Server error' });
  }
});

router.get('/:teamId/members', auth, async (req, res) => {
  try {
    const { teamId } = req.params;
    if (!isValidObjectId(teamId)) {
      return res.status(400).json({ message: 'Invalid team id' });
    }

    const membership = await getActiveMembership(teamId, req.user.id);
    if (!membership) {
      return res.status(403).json({ message: 'Access denied' });
    }

    const members = await TeamMembership.find({ team: teamId, status: 'active' })
      .populate('user', 'username profilePicture')
      .sort({ createdAt: 1 });

    return res.json(members);
  } catch (err) {
    console.error('List members error:', err);
    return res.status(500).json({ message: 'Server error' });
  }
});

router.delete('/:teamId/members/:userId', auth, async (req, res) => {
  try {
    const { teamId, userId } = req.params;
    if (!isValidObjectId(teamId) || !isValidObjectId(userId)) {
      return res.status(400).json({ message: 'Invalid id' });
    }

    const requesterMembership = await getActiveMembership(teamId, req.user.id);
    if (!requesterMembership || !['owner', 'coach'].includes(requesterMembership.role)) {
      return res.status(403).json({ message: 'Access denied' });
    }

    const targetMembership = await TeamMembership.findOne({
      team: teamId,
      user: userId,
      status: 'active',
    });

    if (!targetMembership) {
      return res.status(404).json({ message: 'Member not found' });
    }

    if (
      requesterMembership.role === 'coach' &&
      ['owner', 'coach'].includes(targetMembership.role)
    ) {
      return res.status(403).json({ message: 'Coaches cannot remove other coaches or owners' });
    }

    if (targetMembership.role === 'owner' && userId === req.user.id) {
      return res.status(403).json({ message: 'Cannot remove yourself as owner' });
    }

    const matches = await Match.find({ team: teamId }).select('_id');
    const matchIds = matches.map((m) => m._id);

    const videos = await Video.find({ match: { $in: matchIds }, uploadedBy: userId });

    await Promise.all(
      videos.map((video) =>
        s3.send(new DeleteObjectCommand({
          Bucket: process.env.AWS_BUCKET_NAME,
          Key: video.s3Key,
        })).catch((err) => console.error('S3 delete error for member removal:', err))
      )
    );

    if (videos.length > 0) {
      await Video.deleteMany({ match: { $in: matchIds }, uploadedBy: userId });
    }

    targetMembership.status = 'removed';
    await targetMembership.save();

    return res.json({ success: true });
  } catch (err) {
    console.error('Remove member error:', err);
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
