const mongoose = require("mongoose");

const tagSchema = new mongoose.Schema(
  {
    label: {
      type: String,
      required: true,
    },
    timeSec: {
      type: Number,
      required: true,
      min: 0,
    },
  },
  { _id: true }
);

const videoSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
    },
    url: {
      type: String,
      required: true,
    },
    s3Key: {
      type: String,
      required: true,
    },
    uploadedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    match: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Match",
      required: true,
      index: true,
    },
    tags: {
      type: [tagSchema],
      default: [],
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Video", videoSchema);