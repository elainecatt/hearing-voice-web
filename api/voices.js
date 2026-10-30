// GET /api/voices -> the curated voice list (no secrets in here).
const VOICES = require("./_voices.js");

module.exports = (req, res) => {
  res.setHeader("Cache-Control", "public, max-age=3600");
  res.status(200).json(VOICES);
};
