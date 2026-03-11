const mongoose = require('mongoose');

const matchSchema = new mongoose.Schema(
  {
    team: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Team',
      required: true,
      index: true,
    },
    opponent: { type: String, required: true, trim: true },
    date: { type: Date, required: true, index: true },
    location: { type: String, trim: true, default: '' },
    notes: { type: String, trim: true, default: '' },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    status: {
      type: String,
      enum: ['scheduled', 'completed', 'canceled'],
      default: 'scheduled',
      required: true,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Match', matchSchema);
