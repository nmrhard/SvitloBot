const Fastify = require('fastify');
const fetch = require('node-fetch');
const { Sequelize, DataTypes } = require('sequelize');
require('dotenv').config();

// Initialize Fastify app
const fastify = Fastify({ logger: true });

const PORT = process.env.PORT || 3000;

// Telegram constants
const statuses = {
  offline: '❌Світло вимкнули',
  online: '✅Світло увімкнули',
};

const CHAT_ID = process.env.CHAT_ID;
const API_TOKEN = process.env.API_TOKEN;
const THREAD_ID = process.env.THREAD_ID;
const tgBotUrl = `https://api.telegram.org/bot${API_TOKEN}`;

// Configure Sequelize
const sequelize = new Sequelize({
  dialect: 'sqlite',
  storage: 'offline_status.db',
});

// Define Model for storing timestamps
const OfflineStatus = sequelize.define(
  'OfflineStatus',
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    offlineStart: {
      type: DataTypes.INTEGER, // UNIX timestamp when offline started
      allowNull: true,
    },
    onlineStart: {
      type: DataTypes.INTEGER, // UNIX timestamp when online started
      allowNull: true,
    },
  },
  {
    tableName: 'status_timestamps',
    timestamps: false,
  }
);

// Helper to format time
function formatTime(time) {
  return new Intl.DateTimeFormat('uk-UA', {
    month: '2-digit',
    day: '2-digit',
    year: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    hourCycle: 'h23',
    timeZone: 'Europe/Kyiv',
  }).format(new Date(time * 1000));
}

// Helper to calculate duration
function calculateDuration(startTime, endTime) {
  const durationMs = (endTime - startTime) * 1000;
  const minutes = Math.floor(durationMs / 60000) % 60;
  const hours = Math.floor(durationMs / 3600000);
  return `${hours}г. ${minutes}хв.`;
}

function getDurationMessage(status, duration) {
  return status === 'offline'
    ? `⏳Cвітло було: <b>${duration}</b>`
    : `⏳Cвітло не було: <b>${duration}</b>`;
}

// Send message to Telegram
async function sendMessage(message) {
  try {
    const response = await fetch(`${tgBotUrl}/sendMessage`, {
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
    fastify.log.error('Error sending message:', error.message);
  }
}

// Route to handle POST requests from Hetrix
fastify.post(
  '/',
  {
    schema: {
      body: {
        type: 'object',
        properties: {
          monitor_status: { type: 'string' },
          timestamp: { type: 'integer' },
        },
        required: ['monitor_status', 'timestamp'],
      },
    },
  },
  async (request, reply) => {
    const { monitor_status: status, timestamp: currentTime } = request.body;
    let message = '';

    // Retrieve the status record from the database
    let statusRecord = await OfflineStatus.findByPk(1);

    if (!statusRecord) {
      // Create the initial record if it doesn't exist
      statusRecord = await OfflineStatus.create({
        id: 1,
        offlineStart: null,
        onlineStart: null,
      });
    }

    if (status === 'offline') {
      if (statusRecord.onlineStart) {
        // Calculate online duration if transitioning from online to offline
        const onlineDuration = calculateDuration(
          statusRecord.onlineStart,
          currentTime
        );
        message = `${statuses[status]}: <b>${formatTime(
          currentTime
        )}</b>\n${getDurationMessage('offline', onlineDuration)}`;
      } else {
        message = `${statuses[status]}: <b>${formatTime(currentTime)}</b>`;
      }

      // Update offline start time
      await statusRecord.update({
        offlineStart: currentTime,
        onlineStart: null,
      });
    } else if (status === 'online') {
      if (statusRecord.offlineStart) {
        // Calculate offline duration if transitioning from offline to online
        const offlineDuration = calculateDuration(
          statusRecord.offlineStart,
          currentTime
        );
        message = `${statuses[status]}: <b>${formatTime(
          currentTime
        )}</b>\n${getDurationMessage('online', offlineDuration)}`;
      } else {
        message = `${statuses[status]}: <b>${formatTime(currentTime)}</b>`;
      }

      // Update online start time
      await statusRecord.update({
        onlineStart: currentTime,
        offlineStart: null,
      });
    }

    // Send the message to Telegram
    await sendMessage(message);
    reply.send({ success: true });
  }
);

// Health check route
fastify.get('/', async (request, reply) => {
  reply.send({ message: 'Request received' });
});

// Start the Fastify server and sync the database
(async () => {
  try {
    await sequelize.sync();
    fastify.log.info('Database synced');
    await fastify.listen({ port: PORT, host: '0.0.0.0' });
    fastify.log.info('Server running on http://localhost:3000');
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
})();
