require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const User = require("./models/User");
const aiRouter = require("./modules/aiRouter");
const emailHandler = require("./modules/emailHandler");
const { initScheduler } = require("./modules/scheduler");

const app = express();
app.use(express.urlencoded({ extended: false }));
app.use(express.json());

// Database Connection
mongoose
  .connect(process.env.MONGO_URI)
  .then(() => {
    console.log("✅ MongoDB Connected");
    initScheduler(sendWhatsApp);
  })
  .catch((err) => console.error("❌ MongoDB Error:", err));

// WhatsApp Webhook
app.post("/whatsapp", async (req, res) => {
  try {
    const msg = req.body.Body?.trim() || "";
    const phone = req.body.From.replace("whatsapp:", "");

    let user = await User.findOne({ phone });
    if (!user) user = await User.create({ phone });

    let reply = "";

    if (msg.startsWith("email:")) {
      reply = await emailHandler(user, msg.replace("email:", "").trim());
    } else if (msg.startsWith("set reminder")) {
      const minutes = parseInt(msg.match(/\d+/)?.[0] || "30");
      user.reminderInterval = minutes;
      await user.save();
      reply = `⏰ Reminder set every ${minutes} minutes`;
    } else if (msg.startsWith("reply")) {
      reply = await emailHandler(user, msg);
    } else if (msg.startsWith("delete spam")) {
      reply = await emailHandler(user, "delete spam");
    } else if (msg.startsWith("label")) {
      reply = await emailHandler(user, msg);
    } else {
      reply = await aiRouter("chat", msg);
    }

    await sendWhatsApp(phone, reply);
    res.sendStatus(200);
  } catch (err) {
    console.error("❌ Error:", err);
    res.sendStatus(500);
  }
});

// OAuth callback for Gmail
app.get("/oauth2callback", async (req, res) => {
  const code = req.query.code;
  const phone = req.query.state;
  
  if (!code) return res.send("❌ Authorization failed");

  try {
    const { google } = require("googleapis");
    const oAuth = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      `${process.env.RENDER_EXTERNAL_URL || 'http://localhost:3000'}/oauth2callback`
    );

    const { tokens } = await oAuth.getToken(code);
    
    await User.findOneAndUpdate(
      { phone },
      { gmailToken: tokens }
    );

    res.send("✅ Gmail connected! You can close this window and return to WhatsApp.");
  } catch (err) {
    console.error(err);
    res.send("❌ Failed to connect Gmail");
  }
});

// Send WhatsApp message helper
function sendWhatsApp(to, body) {
  const client = require("twilio")(
    process.env.TWILIO_ACCOUNT_SID,
    process.env.TWILIO_AUTH_TOKEN
  );

  return client.messages.create({
    from: process.env.TWILIO_WHATSAPP_FROM,
    to: `whatsapp:${to}`,
    body,
  });
}

// Health check
app.get("/", (req, res) => {
  res.send("🤖 WhatsApp Email Assistant is running!");
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});

module.exports = { sendWhatsApp };
