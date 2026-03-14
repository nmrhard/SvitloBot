const fetch = require('node-fetch');
const FormData = require('form-data');

const {
  API_TOKEN,
  CHAT_ID: DEFAULT_CHAT_ID,
  THREAD_ID: DEFAULT_THREAD_ID,
  TG_BOT_URL,
} = require('../config/constants');

function buildThreadPayload(threadId) {
  if (!threadId) {
    return {};
  }

  return { message_thread_id: threadId };
}

/**
 * Send message to Telegram chat
 * @param {string} message - HTML formatted message
 * @param {object} logger - Fastify logger instance
 * @param {object} options - Optional parameters
 * @param {string} options.chatId - Chat ID override (defaults to env CHAT_ID)
 * @param {string} options.threadId - Thread ID override for this message
 * @returns {Promise<object|undefined>} Telegram API response
 */
async function sendMessage(message, logger, options = {}) {
  const { chatId = DEFAULT_CHAT_ID, threadId = DEFAULT_THREAD_ID } = options;
  try {
    const response = await fetch(`${TG_BOT_URL}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: message,
        parse_mode: 'HTML',
        ...buildThreadPayload(threadId),
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

/**
 * Send photo to Telegram chat
 * @param {string|object} photoInput - Public photo URL or binary payload
 * @param {string} caption - Optional photo caption
 * @param {object} logger - Fastify logger instance
 * @param {object} options - Optional parameters
 * @param {string} options.chatId - Chat ID override (defaults to env CHAT_ID)
 * @param {string} options.threadId - Thread ID override for this photo
 * @returns {Promise<object|undefined>} Telegram API response
 */
async function sendPhoto(photoInput, caption, logger, options = {}) {
  const { chatId = DEFAULT_CHAT_ID, threadId } = options;
  try {
    let response;
    if (
      photoInput &&
      typeof photoInput === 'object' &&
      photoInput.photoBuffer
    ) {
      const form = new FormData();
      form.append('chat_id', chatId);
      form.append('photo', photoInput.photoBuffer, {
        contentType: photoInput.contentType || 'image/png',
        filename: photoInput.fileName || 'schedule.png',
      });
      if (caption) {
        form.append('caption', caption);
        form.append('parse_mode', 'HTML');
      }
      const threadPayload = buildThreadPayload(threadId);
      if (threadPayload.message_thread_id) {
        form.append('message_thread_id', threadPayload.message_thread_id);
      }

      response = await fetch(`${TG_BOT_URL}/sendPhoto`, {
        method: 'POST',
        headers: form.getHeaders(),
        body: form,
      });
    } else {
      response = await fetch(`${TG_BOT_URL}/sendPhoto`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          photo: photoInput,
          caption,
          parse_mode: 'HTML',
          ...buildThreadPayload(threadId),
        }),
      });
    }

    if (!response.ok) {
      throw new Error(`Telegram API Error: ${response.statusText}`);
    }

    return await response.json();
  } catch (error) {
    logger?.error('Error sending photo:', error.message);
  }
}

module.exports = {
  sendMessage,
  sendPhoto,
};

