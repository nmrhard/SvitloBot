const fetch = require('node-fetch');

const { CHAT_ID, TG_BOT_URL, THREAD_ID } = require('../config/constants');

/**
 * Send message to Telegram chat
 * @param {string} message - HTML formatted message
 * @param {object} logger - Fastify logger instance
 * @returns {Promise<object|undefined>} Telegram API response
 */
async function sendMessage(message, logger) {
  try {
    const response = await fetch(`${TG_BOT_URL}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: CHAT_ID,
        text: message,
        parse_mode: 'HTML',
        message_thread_id: THREAD_ID,
      }),
    });

    if (!response.ok) {
      throw new Error(`Telegram API Error: ${response.statusText}`);
    }

    return await response.json();
  } catch (error) {
    logger?.error('Error sending message:', error.message);
  }
}

module.exports = {
  sendMessage,
};

