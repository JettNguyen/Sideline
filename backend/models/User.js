const mongoose = require('mongoose')

const userSchema = new mongoose.Schema(
    {
        username: { type: String, required: true, unique: true},
        email: {type: String, required: true, unique: true},
        passwordHash: { type: String, required: true},

        isEmailVerified: { type: Boolean, default: false },
        emailVerificationTokenHash: { type: String, default: null },
        emailVerificationExpires: { type: Date, default: null },
        passwordResetTokenHash: { type: String, default: null },
        passwordResetExpires: { type: Date, default: null },
        profilePicture: { type: String, default: null, }
    },
    { timestamps: true }
);

module.exports = mongoose.model('User', userSchema);