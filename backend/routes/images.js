const express = require('express');
const multer = require('multer');
const { PutObjectCommand } = require('@aws-sdk/client-s3');

const User = require('../models/User');
const s3 = require('../config/s3');
const auth = require('../middleware/authMiddleware');

const router = express.Router();

const { GetObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
});

router.post(
  '/',
  auth,
  upload.single('file'),
  async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ message: 'No file uploaded' });
      }

      const userId = req.user?.id || req.user?._id;

      if (!userId) {
        return res.status(401).json({ message: 'Unauthorized' });
      }

      const file = req.file;

      const s3Key = `images/${userId}-${Date.now()}-${file.originalname}`;

      await s3.send(
        new PutObjectCommand({
          Bucket: process.env.AWS_BUCKET_NAME,
          Key: s3Key,
          Body: file.buffer,
          ContentType: file.mimetype,
        })
      );

      const user = await User.findByIdAndUpdate(
        userId,
        { profilePicture: s3Key },
        { new: true }
      );

      const getCommand = new GetObjectCommand({
        Bucket: process.env.AWS_BUCKET_NAME,
        Key: s3Key,
      });

      const signedUrl = await getSignedUrl(s3, getCommand, { expiresIn: 3600 });

      return res.status(200).json({
        s3Key,
        url: signedUrl,
        user,
      });

    } catch (err) {
      console.error('Image upload error:', err);
      res.status(500).json({ message: 'Server error' });
    }
  }
);

router.get('/user/:userId', auth, async (req, res) => {
  try {
    const user = await User.findById(req.params.userId).select('profilePicture');
    if (!user || !user.profilePicture) {
      return res.status(404).json({ message: 'No profile picture' });
    }

    const command = new GetObjectCommand({
      Bucket: process.env.AWS_BUCKET_NAME,
      Key: user.profilePicture,
    });

    const signedUrl = await getSignedUrl(s3, command, { expiresIn: 3600 });
    res.json({ url: signedUrl });
  } catch (err) {
    console.error('Get user profile picture error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

router.get('/me', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);

    if (!user || !user.profilePicture) {
      return res.status(404).json({ message: 'No profile picture' });
    }

    const command = new GetObjectCommand({
      Bucket: process.env.AWS_BUCKET_NAME,
      Key: user.profilePicture,
    });

    const signedUrl = await getSignedUrl(s3, command, {
      expiresIn: 3600,
    });

    res.json({ url: signedUrl });

  } catch (err) {
    console.error('Get profile picture error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;