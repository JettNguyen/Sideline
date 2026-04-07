const express = require('express');
const multer = require('multer');
const mongoose = require('mongoose');
const { PutObjectCommand, GetObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');

const Video = require('../models/Video');
const Match = require('../models/Match');
const TeamMembership = require('../models/TeamMembership');
const s3 = require('../config/s3');
const auth = require('../middleware/authMiddleware');

const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');

const router = express.Router();

const upload = multer({
  limits: { fileSize: 100 * 1024 * 1024 }, // 100MB limit
});

router.post(
  '/',
  auth,
  upload.single('files'),
  async (req, res) => {
    try {
      const { matchId } = req.body || {};

      if (!matchId || !mongoose.Types.ObjectId.isValid(matchId)) {
        return res.status(400).json({ message: 'Valid matchId is required' });
      }

      if (!req.file) {
        return res.status(400).json({ message: 'No file uploaded or file exceeds 100MB limit' });
      }

      const match = await Match.findById(matchId);
      if (!match) {
        return res.status(404).json({ message: 'Match not found' });
      }

      const membership = await TeamMembership.findOne({
        team: match.team,
        user: req.user.id,
        status: 'active',
      });

      if (!membership) {
        return res.status(403).json({ message: 'Access denied for this match' });
      }

      if (!req.file) {
        return res.status(400).json({ message: 'No file uploaded' });
      }

      const file = req.file;

      const s3Key = `videos/${Date.now()}-${file.originalname}`;

      await s3.send(
        new PutObjectCommand({
          Bucket: process.env.AWS_BUCKET_NAME,
          Key: s3Key,
          Body: file.buffer,
          ContentType: file.mimetype,
        })
      );

      const url = `https://${process.env.AWS_BUCKET_NAME}.s3.amazonaws.com/${s3Key}`;

      const video = await Video.create({
        title: file.originalname,
        url,
        s3Key,
        uploadedBy: req.user.id,
        match: match._id,
      });

      res.status(201).json(video);

    } catch (err) {
      console.error('Video upload error:', err);
      res.status(500).json({ message: 'Server error' });
    }
  }
);

router.get('/', auth, async (req, res) => {
  try {
    const { matchId } = req.query;
    if (!matchId || !mongoose.Types.ObjectId.isValid(matchId)) {
      return res.status(400).json({ message: 'Valid matchId query is required' });
    }

    const match = await Match.findById(matchId);
    if (!match) {
      return res.status(404).json({ message: 'Match not found' });
    }

    const membership = await TeamMembership.findOne({
      team: match.team,
      user: req.user.id,
      status: 'active',
    });

    if (!membership) {
      return res.status(403).json({ message: 'Access denied for this match' });
    }

    const videos = await Video.find({ match: match._id })
      .populate('uploadedBy', 'username')
      .sort({ createdAt: -1 });

    res.json(videos);
  } catch (err) {
    console.error('Fetch videos error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

router.get('/me', auth, async (req, res) => {
  try {
    const videos = await Video.find({ uploadedBy: req.user.id })
      .populate({
        path: 'match',
        select: 'opponent date team',
        populate: { path: 'team', select: '_id name' },
      })
      .sort({ createdAt: -1 });

    res.json(videos);
  } catch (err) {
    console.error('Fetch my videos error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

router.get('/member/:userId', auth, async (req, res) => {
  try {
    const { userId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({ message: 'Invalid user id' });
    }

    const [myTeamIds, theirTeamIds] = await Promise.all([
      TeamMembership.find({ user: req.user.id, status: 'active' }).distinct('team'),
      TeamMembership.find({ user: userId, status: 'active' }).distinct('team'),
    ]);

    const mySet = new Set(myTeamIds.map((id) => id.toString()));
    const sharedTeamIds = theirTeamIds.filter((id) => mySet.has(id.toString()));

    if (!sharedTeamIds.length) {
      return res.json([]);
    }

    const matches = await Match.find({ team: { $in: sharedTeamIds } })
      .select('_id opponent date team')
      .populate('team', '_id name');

    const matchIds = matches.map((m) => m._id);
    const matchMap = {};
    matches.forEach((m) => { matchMap[m._id.toString()] = m; });

    const videos = await Video.find({ match: { $in: matchIds }, uploadedBy: userId })
      .sort({ createdAt: -1 });

    const result = videos.map((v) => ({
      _id: v._id,
      title: v.title,
      s3Key: v.s3Key,
      match: matchMap[v.match.toString()] || null,
      tags: v.tags,
      createdAt: v.createdAt,
    }));

    return res.json(result);
  } catch (err) {
    console.error('Member videos error:', err);
    return res.status(500).json({ message: 'Server error' });
  }
});

router.get('/:id/play', auth, async (req, res) => {
  try {
    const video = await Video.findById(req.params.id).populate('match', 'team');

    if (!video) {
      return res.status(404).json({ message: 'Video not found' });
    }

    if (!video.match?.team) {
      return res.status(400).json({ message: 'Video is not linked to a valid match' });
    }

    const membership = await TeamMembership.findOne({
      team: video.match.team,
      user: req.user.id,
      status: 'active',
    });

    if (!membership) {
      return res.status(403).json({ message: 'Access denied for this video' });
    }

    const command = new GetObjectCommand({
      Bucket: process.env.AWS_BUCKET_NAME,
      Key: video.s3Key,
    });

    const signedUrl = await getSignedUrl(s3, command, {
      expiresIn: 3600, // Expires in 1 hour
    });

    res.json({ url: signedUrl });

  } catch (err) {
    console.error('Video playback error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

router.post('/:id/tags', auth, async (req, res) => {
  try {
    const { label, timeSec } = req.body;

    if (!label || timeSec === undefined) {
      return res.status(400).json({ message: 'label and timeSec are required' });
    }

    const video = await Video.findById(req.params.id).populate('match', 'team');

    if (!video) {
      return res.status(404).json({ message: 'Video not found' });
    }

    const membership = await TeamMembership.findOne({
      team: video.match.team,
      user: req.user.id,
      status: 'active',
    });

    if (!membership) {
      return res.status(403).json({ message: 'Access denied for this video' });
    }

    video.tags.push({
      label,
      timeSec,
    });

    await video.save();

    res.json(video.tags);
  } catch (err) {
    console.error('Add tag error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

router.delete('/:videoId/tags/:tagId', auth, async (req, res) => {
  try {
    const { videoId, tagId } = req.params;

    const video = await Video.findById(videoId).populate('match', 'team');

    if (!video) {
      return res.status(404).json({ message: 'Video not found' });
    }

    const membership = await TeamMembership.findOne({
      team: video.match.team,
      user: req.user.id,
      status: 'active',
    });

    if (!membership) {
      return res.status(403).json({ message: 'Access denied for this video' });
    }

    video.tags = video.tags.filter(tag => tag._id.toString() !== tagId);

    await video.save();

    res.json({ success: true });

  } catch (err) {
    console.error('Delete tag error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

router.delete('/:id', auth, async (req, res) => {
  try {
    const video = await Video.findById(req.params.id).populate('match', 'team');

    if (!video) {
      return res.status(404).json({ message: 'Video not found' });
    }

    const isUploader = video.uploadedBy.toString() === req.user.id;

    const membership = await TeamMembership.findOne({
      team: video.match.team,
      user: req.user.id,
      status: 'active',
    });

    const isAdmin = membership && ['owner', 'coach'].includes(membership.role);

    if (!isUploader && !isAdmin) {
      return res.status(403).json({ message: 'Not authorized to delete this video' });
    }

    await s3.send(
      new DeleteObjectCommand({
        Bucket: process.env.AWS_BUCKET_NAME,
        Key: video.s3Key,
      })
    );

    await Video.deleteOne({ _id: video._id });

    res.json({ success: true });
  } catch (err) {
    console.error('Delete video error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});


module.exports = router;