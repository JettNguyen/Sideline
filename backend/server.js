const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');

const videoRoutes = require("./routes/videos");
const teamRoutes = require('./routes/teams');
const matchRoutes = require('./routes/matches');
const inviteRoutes = require('./routes/invites');

const app = express();

const allowedOrigins = (process.env.CLIENT_ORIGIN || '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

const corsOptions = allowedOrigins.length
    ? {
        origin(origin, callback) {
            if (!origin || allowedOrigins.includes(origin)) {
                return callback(null, true);
            }

            return callback(new Error('Not allowed by CORS'));
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

const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/users');
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/teams', teamRoutes);
app.use('/api/matches', matchRoutes);
app.use('/api/invites', inviteRoutes);

const PORT = process.env.PORT || 5001;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));