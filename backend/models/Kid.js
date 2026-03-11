const mongoose = require('mongoose');

const kidSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    ageGroup: { type: String, trim: true, default: '' },
    team: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Team',
      required: true,
      index: true,
    },
    guardianUser: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Kid', kidSchema);
