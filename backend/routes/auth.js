const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const User = require('../models/User');
const { sendVerificationEmail, sendPasswordResetEmail } = require('../utils/email');

const router = express.Router();

const VERIFICATION_TOKEN_HOURS = 24;

const makeVerificationToken = () => crypto.randomBytes(32).toString('hex');
const hashToken = (token) =>
    crypto.createHash('sha256').update(token).digest('hex');

const buildVerificationUrl = (token) => {
    const clientBase =
        process.env.CLIENT_APP_URL ||
        process.env.CLIENT_ORIGIN?.split(',')[0]?.trim() ||
        'http://localhost:3000';

    return `${clientBase}/#/login?verifyToken=${token}`;
};

const buildResetUrl = (token) => {
    const clientBase =
        process.env.CLIENT_APP_URL ||
        process.env.CLIENT_ORIGIN?.split(',')[0]?.trim() ||
        'http://localhost:3000';

    return `${clientBase}/#/login?resetToken=${token}`;
};

const makeResetToken = () => crypto.randomBytes(32).toString('hex');



//POST /api/auth/register

router.post('/register', async (req, res) => {
    try {
        const username = req.body?.username?.trim();
        const email = req.body?.email?.trim().toLowerCase();
        const { password } = req.body;

        if(!username || !email || !password) {
            return res.status(400).json({ message: 'Missing required fields' });
        }

        const existingUsername = await User.findOne({ username });
        if(existingUsername) {
            return res.status(409).json({ message: 'Username already in use' });
        }

        const existingEmail = await User.findOne({ email });
        if(existingEmail) {
            return res.status(409).json({ message: 'Email already in use' });
        }

        const passwordHash = await bcrypt.hash(password, 10);

        const rawToken = makeVerificationToken();
        const tokenHash = hashToken(rawToken);
        const expires = new Date(Date.now() + VERIFICATION_TOKEN_HOURS * 60 * 60 * 1000);

        const user = await User.create({
            username,
            email,
            passwordHash,
            isEmailVerified: false,
            emailVerificationTokenHash: tokenHash,
            emailVerificationExpires: expires,
        });

        const verificationUrl = buildVerificationUrl(rawToken);

        await sendVerificationEmail({
            to: user.email,
            username: user.username,
            verificationUrl,
        });

        res.status(201).json({
            message: 'Account created. Please check your email to verify your account.',
            requiresEmailVerification: true,
        });
    } catch (err) {
        console.error('Register error:', err);
        res.status(500).json({ message: 'Server error'});
    }
});

//GET /api/auth/verify-email?token=...
router.get('/verify-email', async (req, res) => {
    try {
        const { token } = req.query;

        if (!token) {
            return res.status(400).json({ message: 'Verification token is required' });
        }

        const tokenHash = hashToken(token);

        const user = await User.findOne({
            emailVerificationTokenHash: tokenHash,
            emailVerificationExpires: { $gt: new Date() },
        });

        if (!user) {
            return res.status(400).json({ message: 'Invalid or expired verification link' });
        }

        user.isEmailVerified = true;
        user.emailVerificationTokenHash = null;
        user.emailVerificationExpires = null;

        await user.save();

        res.json({ message: 'Email verified successfully. You can now log in.' });
    } catch (err) {
        console.error('Verify email error:', err);
        res.status(500).json({ message: 'Server error' });
    }
});

//POST /api/auth/resend-verification
router.post('/resend-verification', async (req, res) => {
    try {
        const email = req.body?.email?.trim().toLowerCase();
        const providedUsername = req.body?.username?.trim();

        if (!email) {
            return res.status(400).json({ message: 'Email is required' });
        }

        const user = await User.findOne({ email });

        if (!user) {
            return res.status(404).json({ message: 'No account found with that email' });
        }

        if (providedUsername && user.username !== providedUsername) {
            return res.status(400).json({ message: 'Provided email does not match the entered username' });
        }

        if (user.isEmailVerified) {
            return res.status(400).json({ message: 'Email is already verified' });
        }

        const rawToken = makeVerificationToken();
        const tokenHash = hashToken(rawToken);
        const expires = new Date(Date.now() + VERIFICATION_TOKEN_HOURS * 60 * 60 * 1000);

        user.emailVerificationTokenHash = tokenHash;
        user.emailVerificationExpires = expires;
        await user.save();

        const verificationUrl = buildVerificationUrl(rawToken);

        await sendVerificationEmail({
            to: user.email,
            username: user.username,
            verificationUrl,
        });

        res.json({ message: 'Verification email sent' });
    } catch (err) {
        console.error('Resend verification error:', err);
        res.status(500).json({ message: 'Server error' });
    }
});

// POST /api/auth/request-password-reset
router.post('/request-password-reset', async (req, res) => {
    try {
        const email = req.body?.email?.trim().toLowerCase();

        if (!email) {
            return res.status(400).json({ message: 'Email is required' });
        }

        const user = await User.findOne({ email });
        if (!user) {
            return res.status(404).json({ message: 'No account found with that email' });
        }

        const rawToken = makeResetToken();
        const tokenHash = hashToken(rawToken);
        const expires = new Date(Date.now() + 1 * 60 * 60 * 1000); // 1 hour

        user.passwordResetTokenHash = tokenHash;
        user.passwordResetExpires = expires;
        await user.save();

        const resetUrl = buildResetUrl(rawToken);

        await sendPasswordResetEmail({ to: user.email, username: user.username, resetUrl });

        res.json({ message: 'Password reset email sent' });
    } catch (err) {
        console.error('Request password reset error:', err);
        res.status(500).json({ message: 'Server error' });
    }
});

// POST /api/auth/reset-password
router.post('/reset-password', async (req, res) => {
    try {
        const { token, password } = req.body || {};
        if (!token || !password) {
            return res.status(400).json({ message: 'Token and new password are required' });
        }

        const tokenHash = hashToken(token);

        const user = await User.findOne({
            passwordResetTokenHash: tokenHash,
            passwordResetExpires: { $gt: new Date() },
        });

        if (!user) {
            return res.status(400).json({ message: 'Invalid or expired password reset token' });
        }

        const passwordHash = await bcrypt.hash(password, 10);
        user.passwordHash = passwordHash;
        user.passwordResetTokenHash = null;
        user.passwordResetExpires = null;

        await user.save();

        res.json({ message: 'Password reset successful! You can now log in.' });
    } catch (err) {
        console.error('Reset password error:', err);
        res.status(500).json({ message: 'Server error' });
    }
});

router.post('/login', async (req, res) => {
    try {
        const identifier = req.body?.username?.trim();
        const { password } = req.body;

        if(!identifier || !password) {
            return res.status(400).json({ message: 'Missing username/email or password' });
        }

        const query = {
            $or: [
                { username: identifier },
                { email: identifier.toLowerCase() }
            ]
        };

        const user = await User.findOne(query);
        if(!user) {
            return res.status(401).json({ message: 'Invalid credentials' });
        }

        const isMatch = await bcrypt.compare(password, user.passwordHash);
        if(!isMatch) {
            return res.status(401).json({ message: 'Invalid credentials' });
        }

        if (!user.isEmailVerified) {
            return res.status(403).json({
                message: 'Please verify your email before logging in.',
                requiresEmailVerification: true,
            });
        }

        const token = jwt.sign(
            { userId: user._id },
            process.env.JWT_SECRET,
            { expiresIn: '7d' }
        );

        res.json({
            token,
            user: {
                _id: user._id,
                username: user.username,
                email: user.email,
                isEmailVerified: user.isEmailVerified,
            },
        });
    } catch (err) {
        console.error('Login error:', err);
        res.status(500).json({ message: 'Server error' });
    }
});

module.exports = router;