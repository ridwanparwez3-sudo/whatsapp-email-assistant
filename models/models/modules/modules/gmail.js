const { google } = require("googleapis");

function getClient(tokens) {
  const oAuth = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    `${process.env.RENDER_EXTERNAL_URL || 'http://localhost:3000'}/oauth2callback`
  );
  oAuth.setCredentials(tokens);
  return oAuth;
}

async function readInbox(tokens) {
  try {
    const auth = getClient(tokens);
    const gmail = google.gmail({ version: "v1", auth });

    const res = await gmail.users.messages.list({
      userId: "me",
      q: "is:unread",
      maxResults: 50
    });

    if (!res.data.messages) return [];

    const emails = await Promise.all(
      res.data.messages.slice(0, 20).map(async (msg) => {
        const detail = await gmail.users.messages.get({
          userId: "me",
          id: msg.id,
          format: "metadata",
          metadataHeaders: ["From", "Subject", "Date"]
        });

        const headers = detail.data.payload.headers;
        const from = headers.find(h => h.name === "From")?.value || "Unknown";
        const subject = headers.find(h => h.name === "Subject")?.value || "(No Subject)";
        const date = headers.find(h => h.name === "Date")?.value || "";

        let category = "reply";
        const subjectLower = subject.toLowerCase();
        
        if (subjectLower.includes("spam") || subjectLower.includes("unsubscribe")) {
          category = "spam";
        } else if (subjectLower.includes("promo") || subjectLower.includes("offer") || 
                   subjectLower.includes("deal") || subjectLower.includes("sale")) {
          category = "promotions";
        }

        return {
          id: msg.id,
          from: from.replace(/<.*>/, "").trim(),
          subject,
          date,
          category
        };
      })
    );

    return emails;
  } catch (err) {
    console.error("Gmail read error:", err);
    throw new Error("Failed to read inbox. Please reconnect Gmail.");
  }
}

async function sendEmail(tokens, to, subject, body) {
  try {
    const auth = getClient(tokens);
    const gmail = google.gmail({ version: "v1", auth });

    const email = [
      `To: ${to}`,
      `Subject: ${subject}`,
      "",
      body
    ].join("\n");

    const encodedMessage = Buffer.from(email)
      .toString("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");

    await gmail.users.messages.send({
      userId: "me",
      requestBody: {
        raw: encodedMessage
      }
    });

    return "✅ Email sent successfully";
  } catch (err) {
    console.error("Gmail send error:", err);
    throw new Error("Failed to send email");
  }
}

async function deleteEmails(tokens, emailIds) {
  try {
    const auth = getClient(tokens);
    const gmail = google.gmail({ version: "v1", auth });

    await Promise.all(
      emailIds.map(id =>
        gmail.users.messages.trash({
          userId: "me",
          id
        })
      )
    );

    return emailIds.length;
  } catch (err) {
    console.error("Gmail delete error:", err);
    throw new Error("Failed to delete emails");
  }
}

async function labelEmail(tokens, emailId, labelName) {
  try {
    const auth = getClient(tokens);
    const gmail = google.gmail({ version: "v1", auth });

    const labels = await gmail.users.labels.list({ userId: "me" });
    let label = labels.data.labels.find(l => 
      l.name.toLowerCase() === labelName.toLowerCase()
    );

    if (!label) {
      const created = await gmail.users.labels.create({
        userId: "me",
        requestBody: {
          name: labelName,
          labelListVisibility: "labelShow",
          messageListVisibility: "show"
        }
      });
      label = created.data;
    }

    await gmail.users.messages.modify({
      userId: "me",
      id: emailId,
      requestBody: {
        addLabelIds: [label.id]
      }
    });

    return "✅ Email labeled successfully";
  } catch (err) {
    console.error("Gmail label error:", err);
    throw new Error("Failed to label email");
  }
}

function getAuthUrl(userPhone) {
  const oAuth = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    `${process.env.RENDER_EXTERNAL_URL || 'http://localhost:3000'}/oauth2callback`
  );

  return oAuth.generateAuthUrl({
    access_type: "offline",
    scope: [
      "https://www.googleapis.com/auth/gmail.readonly",
      "https://www.googleapis.com/auth/gmail.send",
      "https://www.googleapis.com/auth/gmail.modify"
    ],
    state: userPhone
  });
}

module.exports = {
  readInbox,
  sendEmail,
  deleteEmails,
  labelEmail,
  getAuthUrl
};
