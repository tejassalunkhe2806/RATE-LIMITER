const client = require('./redis');
const crypto = require('crypto');

const POLICY_PREFIX = 'policy:';
const API_KEY_PREFIX = 'apikey:';

async function getPolicy(clientId) {
  return await client.get(`${POLICY_PREFIX}${clientId}`);
}

async function setPolicy(clientId, policy) {
  await client.set(`${POLICY_PREFIX}${clientId}`, policy);
}

async function deletePolicy(clientId) {
  await client.del(`${POLICY_PREFIX}${clientId}`);
}

async function getAllPolicies() {
  const keys = await client.keys(`${POLICY_PREFIX}*`);
  const policies = {};
  for (const key of keys) {
    const clientId = key.replace(POLICY_PREFIX, '');
    const data = await client.get(key);
    policies[clientId] = data;
  }
  return policies;
}

// API Key Methods
async function generateApiKey(clientId, policy, userId = null) {
  const randomBytes = crypto.randomBytes(12).toString('hex');
  const apiKey = `rl_live_${randomBytes}`;
  
  const keyData = {
    apiKey,
    clientId,
    userId,
    algorithm: policy.algorithm || 'sliding-window',
    limit: parseInt(policy.limit) || 100,
    window: parseInt(policy.window) || 60,
    createdAt: Date.now()
  };

  await client.set(`${API_KEY_PREFIX}${apiKey}`, keyData);
  
  if (userId) {
    await client.sadd(`userkeys:${userId}`, apiKey);
  }
  
  return keyData;
}

async function getApiKey(apiKey) {
  return await client.get(`${API_KEY_PREFIX}${apiKey}`);
}

async function revokeApiKey(apiKey, userId = null) {
  await client.del(`${API_KEY_PREFIX}${apiKey}`);
  // Clean up telemetry data as well
  await client.del(`logs:${apiKey}`);
  await client.del(`analytics:${apiKey}`);
  
  if (userId) {
    await client.srem(`userkeys:${userId}`, apiKey);
  }
}

async function getUserApiKeys(userId) {
  const apiKeys = await client.smembers(`userkeys:${userId}`) || [];
  const keysData = [];
  
  for (const apiKey of apiKeys) {
    const data = await client.get(`${API_KEY_PREFIX}${apiKey}`);
    if (data) {
      keysData.push(data);
    } else {
      // Clean up orphaned reference in Set if the key no longer exists
      await client.srem(`userkeys:${userId}`, apiKey);
    }
  }
  
  // Sort by newest first
  return keysData.sort((a, b) => b.createdAt - a.createdAt);
}

module.exports = { 
  getPolicy, 
  setPolicy, 
  deletePolicy, 
  getAllPolicies,
  generateApiKey,
  getApiKey,
  revokeApiKey,
  getUserApiKeys
};