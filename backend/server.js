const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');

const videoRoutes = require("./routes/videos");
const teamRoutes = require('./routes/teams');
const matchRoutes = require('./routes/matches');
const inviteRoutes = require('./routes/invites');
const profilePictureRoutes = require('./routes/images');

const app = express();

const clientOriginEnv = process.env.CLIENT_ORIGIN || '';
const clientAppUrlEnv = process.env.CLIENT_APP_URL || '';

const allowedOrigins = Array.from(
    new Set(
        `${clientOriginEnv},${clientAppUrlEnv}`
            .split(',')
            .map((origin) => origin.trim().replace(/\/+$/, ''))
            .filter(Boolean)
    )
);

if (allowedOrigins.length === 0) {
    throw new Error('Missing CORS origins. Set CLIENT_ORIGIN and/or CLIENT_APP_URL in your environment.');
}

const corsOptions = allowedOrigins.length
    ? {
        origin(origin, callback) {
            const normalized = origin ? origin.replace(/\/+$/, '') : origin;
            if (!origin || allowedOrigins.includes(normalized)) {
                return callback(null, true);
            }

            return callback(new Error(`Not allowed by CORS: ${origin}`));
        },
      }
    : undefined;

app.use(express.json());
app.use(cors(corsOptions));

mongoose.connect(process.env.MONGO_URI)
    .then(() => console.log('MongoDB connected'))
    .catch((err => console.error('MongoDB connection error:', err)));

app.get('/', (req, res) => {
    res.json({message: 'API is running'});
});

app.use('/api/videos', videoRoutes);
app.use('/api/images', profilePictureRoutes);

const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/users');
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/teams', teamRoutes);
app.use('/api/matches', matchRoutes);
app.use('/api/invites', inviteRoutes);

app.use((err, req, res, next) => {
    if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(413).json({ message: 'File size exceeds 100MB limit' });
    }
    if (err.code === 'LIMIT_FILES') {
        return res.status(400).json({ message: 'Too many files' });
    }
    console.error('Error:', err);
    res.status(500).json({ message: 'Server error' });
});

// Verify critical environment variables before starting
const requiredEnvVars = ['MONGO_URI', 'JWT_SECRET'];
const missingVars = requiredEnvVars.filter(v => !process.env[v]);

if (!process.env.CLIENT_ORIGIN && !process.env.CLIENT_APP_URL) {
    missingVars.push('CLIENT_ORIGIN or CLIENT_APP_URL');
}

if (missingVars.length > 0) {
    console.error(`CRITICAL: Missing required environment variables: ${missingVars.join(', ')}`);
    console.error('Please set these in your .env file before starting the server.');
    process.exit(1);
}

const PORT = process.env.PORT || 5001;
const HOST = '0.0.0.0'; // Listen on all network interfaces
app.listen(PORT, HOST, () => {
    console.log(`Server running on port ${PORT}`);
});