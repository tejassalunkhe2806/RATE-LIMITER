const express = require('express');
const router = express.Router();
const { generateApiKey, getUserApiKeys, revokeApiKey, getApiKey } = require('../policies');
const client = require('../redis');
const telemetryEvents = require('../events');
const { authenticateToken } = require('../middleware/authMiddleware');

// Helper middleware that optionally authenticates the token (doesn't reject if missing)
function optionalAuthenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) {
    req.user = null;
    return next();
  }
  const admin = require('firebase-admin');
  if (!admin.apps || admin.apps.length === 0) {
    req.user = { uid: 'mock_user_123' };
    return next();
  }
  admin.auth().verifyIdToken(token)
    .then((decodedToken) => {
      req.user = decodedToken;
      next();
    })
    .catch(() => {
      req.user = null;
      next();
    });
}

// POST /api/keys/generate
router.post('/keys/generate', optionalAuthenticateToken, async (req, res) => {
  const { clientId, algorithm, limit, window } = req.body;
  if (!clientId || !algorithm || !limit || !window) {
    return res.status(400).json({ error: 'Missing parameters: clientId, algorithm, limit, window' });
  }

  const userId = req.user ? req.user.uid : null;

  try {
    const keyData = await generateApiKey(clientId, { algorithm, limit, window }, userId);
    res.status(201).json(keyData);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/keys (List all keys for the logged-in user)
router.get('/keys', authenticateToken, async (req, res) => {
  try {
    const keys = await getUserApiKeys(req.user.uid);
    res.json(keys);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/keys/:apiKey (Revoke a key)
router.delete('/keys/:apiKey', authenticateToken, async (req, res) => {
  const { apiKey } = req.params;
  try {
    const keyData = await getApiKey(apiKey);
    if (!keyData) {
      return res.status(404).json({ error: 'API key not found' });
    }
    // Security check: ensure the key belongs to the requesting user
    if (keyData.userId !== req.user.uid) {
      return res.status(403).json({ error: 'Forbidden: You do not own this API key' });
    }
    await revokeApiKey(apiKey, req.user.uid);
    res.json({ message: 'API key revoked successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


// GET /api/analytics/:apiKey
router.get('/analytics/:apiKey', async (req, res) => {
  const { apiKey } = req.params;
  try {
    const data = await client.hgetall(`analytics:${apiKey}`);
    if (!data || Object.keys(data).length === 0) {
      return res.json({ total: 0, allowed: 0, blocked: 0, errors429: 0 });
    }
    res.json({
      total: parseInt(data.total) || 0,
      allowed: parseInt(data.allowed) || 0,
      blocked: parseInt(data.blocked) || 0,
      errors429: parseInt(data.errors429) || 0
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/logs/:apiKey
router.get('/logs/:apiKey', async (req, res) => {
  const { apiKey } = req.params;
  try {
    const rawLogs = await client.lrange(`logs:${apiKey}`, 0, 49) || [];
    const logs = rawLogs.map(log => {
      if (typeof log === 'string') {
        try {
          return JSON.parse(log);
        } catch (e) {
          return { error: 'Invalid log format', raw: log };
        }
      }
      return log; // Already parsed object
    });
    res.json(logs);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


// GET /api/stream/:apiKey (SSE Stream)
router.get('/stream/:apiKey', (req, res) => {
  const { apiKey } = req.params;

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const onLog = (key, logEntry) => {
    if (key === apiKey) {
      res.write(`data: ${JSON.stringify(logEntry)}\n\n`);
    }
  };

  telemetryEvents.on('log', onLog);

  req.on('close', () => {
    telemetryEvents.off('log', onLog);
    res.end();
  });
});

// POST /api/test (Playground test endpoint, rate-limited reverse proxy demo)
const rateLimiter = require('../rateLimiter');
router.post('/test', rateLimiter, async (req, res) => {
  const { targetUrl } = req.body || {};
  const urlToFetch = targetUrl || 'https://jsonplaceholder.typicode.com/posts/1';
  
  try {
    const response = await fetch(urlToFetch);
    const contentType = response.headers.get('content-type') || '';
    
    let externalData;
    if (contentType.includes('application/json')) {
      externalData = await response.json();
    } else {
      externalData = await response.text();
    }
    
    res.json({
      message: 'Success! Request allowed by RateLimiterX.',
      proxySource: urlToFetch,
      realApiData: externalData
    });
  } catch (err) {
    res.status(502).json({ error: `Bad Gateway: Failed to fetch from: ${urlToFetch}`, details: err.message });
  }
});



module.exports = router;
