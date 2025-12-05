const aiRouter = require("./aiRouter");
const { readInbox, sendEmail, deleteEmails, labelEmail, getAuthUrl } = require("./gmail");

module.exports = async function emailHandler(user, command) {
  if (!user.gmailToken) {
    const authUrl = getAuthUrl(user.phone);
    return `🔗 Please connect your Gmail first:\n\n${authUrl}\n\nAfter connecting, try your command again!`;
  }

  try {
    if (command === "read inbox") {
      const emails = await readInbox(user.gmailToken);
      return `📧 You have ${emails.length} unread emails.`;
    }

    if (command === "summarize inbox") {
      const emails = await readInbox(user.gmailToken);
      
      const toReply = emails.filter(e => e.category === "reply");
      const spam = emails.filter(e => e.category === "spam");
      const promotions = emails.filter(e => e.category === "promotions");

      let message = `📧 Total emails: ${emails.length}\n`;
      message += `✅ To reply: ${toReply.length}\n`;
      message += `🗑 Spam: ${spam.length}\n`;
      message += `🛒 Promotions: ${promotions.length}\n\n`;

      if (toReply.length > 0) {
        message += `🔹 Emails to reply:\n`;
        toReply.forEach((email, i) => {
          message += `${i + 1}. ${email.from} - ${email.subject}\n`;
        });
        message += `\n💬 Actions:\n`;
        message += `• Reply: "reply [number] [your message]"\n`;
        message += `• Delete spam: "delete spam"\n`;
        message += `• Label: "label [number] [label name]"`;
      }

      user.lastEmails = toReply;
      await user.save();

      return message;
    }

    if (command === "delete spam") {
      const emails = await readInbox(user.gmailToken);
      const spamEmails = emails.filter(e => e.category === "spam");
      
      if (spamEmails.length === 0) {
        return "✅ No spam emails found!";
      }

      const deleted = await deleteEmails(
        user.gmailToken,
        spamEmails.map(e => e.id)
      );
      
      return `🗑 ${deleted} spam email(s) deleted successfully!`;
    }

    if (command.startsWith("reply")) {
      const match = command.match(/reply (\d+) (.+)/);
      if (!match) {
        return "❌ Format: reply [number] [your message]\nExample: reply 1 Yes, I will attend";
      }

      const [, index, message] = match;
      const emailIndex = parseInt(index) - 1;

      if (!user.lastEmails || !user.lastEmails[emailIndex]) {
        return "❌ Email not found. Try 'email: summarize inbox' first.";
      }

      const targetEmail = user.lastEmails[emailIndex];
      
      const aiReply = await aiRouter("email", 
        `Write a professional email reply to "${targetEmail.subject}". The message is: ${message}`
      );

      const emailMatch = targetEmail.from.match(/<(.+?)>/);
      const toEmail = emailMatch ? emailMatch[1] : targetEmail.from;

      await sendEmail(
        user.gmailToken,
        toEmail,
        `Re: ${targetEmail.subject}`,
        aiReply
      );

      return `✅ Reply sent to ${targetEmail.from}!`;
    }

    if (command.startsWith("label")) {
      const match = command.match(/label (\d+) (.+)/);
      if (!match) {
        return "❌ Format: label [number] [label name]\nExample: label 3 marketing";
      }

      const [, index, labelName] = match;
      const emailIndex = parseInt(index) - 1;

      if (!user.lastEmails || !user.lastEmails[emailIndex]) {
        return "❌ Email not found. Try 'email: summarize inbox' first.";
      }

      const targetEmail = user.lastEmails[emailIndex];
      await labelEmail(user.gmailToken, targetEmail.id, labelName);

      return `🏷 Email "${targetEmail.subject}" labeled as "${labelName}"!`;
    }

    return "❌ Unknown command. Try:\n• email: read inbox\n• email: summarize inbox\n• reply [number] [message]\n• delete spam\n• label [number] [label]";

  } catch (err) {
    console.error("Email handler error:", err);
    
    if (err.message.includes("invalid_grant") || err.message.includes("reconnect")) {
      const authUrl = getAuthUrl(user.phone);
      return `🔗 Your Gmail connection expired. Please reconnect:\n\n${authUrl}`;
    }
    
    return `❌ Error: ${err.message}`;
  }
};
