const mongoose = require("mongoose");

const UserSchema = new mongoose.Schema({
  phone: {
    type: String,
    required: true,
    unique: true
  },
  gmailToken: {
    type: Object,
    default: null
  },
  preferences: {
    tone: {
      type: String,
      default: "professional"
    },
    signature: {
      type: String,
      default: "Regards"
    }
  },
  reminderInterval: {
    type: Number,
    default: 30
  },
  lastChecked: {
    type: Date,
    default: Date.now
  },
  lastEmails: {
    type: Array,
    default: []
  }
}, {
  timestamps: true
});

module.exports = mongoose.model("User", UserSchema);
