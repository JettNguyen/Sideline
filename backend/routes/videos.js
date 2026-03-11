const express = require('express');
const multer = require('multer');
const mongoose = require('mongoose');
const { PutObjectCommand } = require('@aws-sdk/client-s3');

const Video = require('../models/Video');
const Match = require('../models/Match');
const TeamMembership = require('../models/TeamMembership');
const s3 = require('../config/s3');
const auth = require('../middleware/authMiddleware');

const { GetObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');

const router = express.Router();

const upload = multer({
  limits: { fileSize: 500 * 1024 * 1024 }, // 500MB limit
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
      .sort({ createdAt: -1 });

    res.json(videos);
  } catch (err) {
    console.error('Fetch videos error:', err);
    res.status(500).json({ message: 'Server error' });
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


module.exports = router;