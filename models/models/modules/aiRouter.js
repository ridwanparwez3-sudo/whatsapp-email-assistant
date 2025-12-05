const axios = require("axios");

module.exports = async function aiRouter(task, text) {
  if (task === "chat") return await freeModel(text);
  if (task === "email") return await freeModel(`Write a professional email: ${text}`);
  return await freeModel(text);
};

async function freeModel(text) {
  try {
    const res = await axios.post(
      "https://api-inference.huggingface.co/models/google/flan-t5-large",
      { 
        inputs: text,
        parameters: {
          max_length: 200,
          temperature: 0.7
        }
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.HF_API_KEY}`,
          "Content-Type": "application/json"
        },
        timeout: 30000
      }
    );

    if (res.data && res.data[0]?.generated_text) {
      return res.data[0].generated_text;
    } else if (Array.isArray(res.data) && res.data.length > 0) {
      return res.data[0];
    }
    
    return "I'm processing your request. Please try again in a moment.";
    
  } catch (err) {
    console.error("AI Error:", err.response?.data || err.message);
    
    if (err.response?.status === 503) {
      return "⏳ AI model is loading. Please wait 20 seconds and try again.";
    }
    
    return "⚠️ AI temporarily unavailable. Try: 'email: read inbox' for email commands.";
  }
}
