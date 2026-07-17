const { Redis } = require('@upstash/redis');
const dotenv = require('dotenv');
dotenv.config();

const client = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

// Optional: test connection on startup
(async () => {
  try {
    await client.ping();
    console.log('✅ Connected to Upstash Redis (REST)');
  } catch (err) {
    console.error('❌ Upstash connection error:', err);
  }
})();

module.exports = client;