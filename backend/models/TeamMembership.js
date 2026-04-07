const mongoose = require('mongoose');

const teamMembershipSchema = new mongoose.Schema(
  {
    team: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Team',
      required: true,
      index: true,
    },
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    role: {
      type: String,
      enum: ['owner', 'coach', 'parent', 'player'],
      default: 'parent',
      required: true,
    },
    status: {
      type: String,
      enum: ['active', 'invited', 'removed', 'requested'],
      default: 'active',
      required: true,
    },
  },
  { timestamps: true }
);

teamMembershipSchema.index({ team: 1, user: 1 }, { unique: true });

module.exports = mongoose.model('TeamMembership', teamMembershipSchema);
