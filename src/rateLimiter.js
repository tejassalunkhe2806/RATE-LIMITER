const { getApiKey } = require('./policies');
const client = require('./redis');
const telemetryEvents = require('./events');

// ---------- Fixed Window ----------
async function fixedWindow(clientId, limit, windowSeconds) {
  const now = Date.now() / 1000;
  const currentWindowStart = Math.floor(now / windowSeconds) * windowSeconds;
  const key = `fixed:${clientId}:${currentWindowStart}`;

  const currentCount = await client.incr(key);
  if (currentCount === 1) {
    await client.expire(key, windowSeconds + 2);
  }

  const remaining = Math.max(0, limit - currentCount);
  const resetTime = currentWindowStart + windowSeconds;
  const allowed = currentCount <= limit;
  const retryAfter = allowed ? 0 : Math.ceil(resetTime - now);

  return {
    allowed,
    remaining,
    reset: Math.ceil(resetTime),
    retryAfter: Math.max(retryAfter, 0)
  };
}

// ---------- Sliding Window ----------
async function slidingWindow(clientId, limit, windowSeconds) {
  const now = Date.now() / 1000;
  const windowSize = windowSeconds;
  const currentWindowStart = Math.floor(now / windowSize) * windowSize;
  const previousWindowStart = currentWindowStart - windowSize;

  const currentKey = `rate:${clientId}:${currentWindowStart}`;
  const previousKey = `rate:${clientId}:${previousWindowStart}`;

  const currentCount = await client.incr(currentKey);
  await client.expire(currentKey, windowSize * 2);
  const previousCount = parseInt(await client.get(previousKey) || 0);

  const elapsedInCurrent = (now - currentWindowStart) / windowSize;
  const estimatedCount = previousCount * (1 - elapsedInCurrent) + currentCount;

  const remaining = Math.max(0, limit - estimatedCount);
  const resetTime = currentWindowStart + windowSize;

  if (estimatedCount > limit) {
    const retryAfter = Math.ceil(resetTime - now);
    return {
      allowed: false,
      remaining: 0,
      reset: Math.ceil(resetTime),
      retryAfter: Math.max(retryAfter, 1)
    };
  } else {
    return {
      allowed: true,
      remaining: Math.floor(remaining),
      reset: Math.ceil(resetTime),
      retryAfter: 0
    };
  }
}

// ---------- Token Bucket ----------
const TOKEN_BUCKET_SCRIPT = `
  local key = KEYS[1]
  local limit = tonumber(ARGV[1])
  local window = tonumber(ARGV[2])
  local now = tonumber(ARGV[3])
  
  local bucket = redis.call('HMGET', key, 'tokens', 'lastRefill')
  local tokens = tonumber(bucket[1]) or limit
  local lastRefill = tonumber(bucket[2]) or now
  
  -- refill
  local elapsed = math.max(0, now - lastRefill)
  local refillRate = limit / window
  local newTokens = math.min(limit, tokens + elapsed * refillRate)
  
  if newTokens < 1 then
    -- insufficient tokens: compute retry-after
    local wait = math.ceil((1 - newTokens) / refillRate)
    return {0, limit, wait}   -- allowed, remaining, retryAfter
  else
    local updatedTokens = newTokens - 1
    redis.call('HMSET', key, 'tokens', updatedTokens, 'lastRefill', now)
    redis.call('EXPIRE', key, window + 3600)
    return {1, updatedTokens, 0}
  end
`;

async function tokenBucket(clientId, limit, windowSeconds) {
  const now = Date.now() / 1000;
  const key = `bucket:${clientId}`;
  const [allowed, remaining, retryAfter] = await client.eval(
    TOKEN_BUCKET_SCRIPT,
    [key],
    [limit.toString(), windowSeconds.toString(), now.toString()]
  );
  return {
    allowed: allowed === 1,
    remaining: Math.floor(remaining),
    reset: Math.ceil(now + windowSeconds),
    retryAfter: retryAfter > 0 ? Math.ceil(retryAfter) : 0
  };
}

// ---------- Leaky Bucket ----------
const LEAKY_BUCKET_SCRIPT = `
  local key = KEYS[1]
  local capacity = tonumber(ARGV[1])
  local window = tonumber(ARGV[2])
  local now = tonumber(ARGV[3])
  
  local bucket = redis.call('HMGET', key, 'water', 'lastLeakTime')
  local water = tonumber(bucket[1]) or 0
  local lastLeak = tonumber(bucket[2]) or now
  
  local elapsed = math.max(0, now - lastLeak)
  local leakRate = capacity / window
  local currentWater = math.max(0, water - elapsed * leakRate)
  
  if currentWater + 1 > capacity then
    local waitTime = math.ceil((currentWater + 1 - capacity) / leakRate)
    return {0, math.floor(capacity - currentWater), math.max(1, waitTime)}
  else
    local updatedWater = currentWater + 1
    redis.call('HMSET', key, 'water', updatedWater, 'lastLeakTime', now)
    redis.call('EXPIRE', key, window + 3600)
    return {1, math.floor(capacity - updatedWater), 0}
  end
`;

async function leakyBucket(clientId, limit, windowSeconds) {
  const now = Date.now() / 1000;
  const key = `leaky:${clientId}`;
  const [allowed, remaining, retryAfter] = await client.eval(
    LEAKY_BUCKET_SCRIPT,
    [key],
    [limit.toString(), windowSeconds.toString(), now.toString()]
  );
  return {
    allowed: allowed === 1,
    remaining: Math.floor(remaining),
    reset: Math.ceil(now + windowSeconds),
    retryAfter: retryAfter > 0 ? Math.ceil(retryAfter) : 0
  };
}

// ---------- Telemetry Logging ----------
async function recordTelemetry(apiKey, allowed, remaining, reset, algorithm, req) {
  try {
    const now = Date.now();
    const logEntry = {
      timestamp: now,
      allowed,
      clientIp: req.ip || '127.0.0.1',
      endpoint: req.originalUrl || req.path,
      method: req.method,
      algorithm,
      remaining
    };
    const logStr = JSON.stringify(logEntry);
    const logKey = `logs:${apiKey}`;
    const analyticsKey = `analytics:${apiKey}`;

    // Store log entry in Redis List (capped at 50)
    await client.lpush(logKey, logStr);
    await client.ltrim(logKey, 0, 49);

    // Increment metrics in a pipeline
    const pipe = client.pipeline();
    pipe.hincrby(analyticsKey, 'total', 1);
    if (allowed) {
      pipe.hincrby(analyticsKey, 'allowed', 1);
    } else {
      pipe.hincrby(analyticsKey, 'blocked', 1);
      pipe.hincrby(analyticsKey, 'errors429', 1);
    }
    await pipe.exec();

    // Publish event for SSE streaming
    await client.publish(`channel:${apiKey}`, logStr);
    telemetryEvents.emit('log', apiKey, logEntry);
  } catch (err) {
    // Non-blocking telemetry failure
    console.error('Telemetry failure:', err);
  }
}

// ---------- Middleware ----------
async function rateLimiter(req, res, next) {
  const apiKeyHeader = req.headers['x-api-key'];
  let keyData;

  try {
    if (!apiKeyHeader) {
      // Unauthenticated access defaults to IP-based rate limiting
      keyData = {
        apiKey: 'anonymous',
        clientId: req.ip || 'anonymous',
        algorithm: 'sliding-window',
        limit: 10,
        window: 60
      };
    } else if (apiKeyHeader === 'rl_demo_default') {
      keyData = await getApiKey(apiKeyHeader);
      if (!keyData) {
        keyData = {
          apiKey: 'rl_demo_default',
          clientId: 'demo_user',
          algorithm: 'sliding-window',
          limit: 100,
          window: 60,
          createdAt: Date.now()
        };
        await client.set(`apikey:rl_demo_default`, keyData);
      }
    } else if (apiKeyHeader.startsWith('rl_live_')) {
      keyData = await getApiKey(apiKeyHeader);
      if (!keyData) {
        return res.status(401).json({ error: 'Invalid API Key' });
      }
    } else {
      return res.status(401).json({ error: 'Malformed API Key prefix' });
    }

    const { apiKey, clientId, algorithm, limit, window: windowSeconds } = keyData;

    let result;
    if (algorithm === 'fixed-window') {
      result = await fixedWindow(clientId, limit, windowSeconds);
    } else if (algorithm === 'sliding-window') {
      result = await slidingWindow(clientId, limit, windowSeconds);
    } else if (algorithm === 'token-bucket') {
      result = await tokenBucket(clientId, limit, windowSeconds);
    } else if (algorithm === 'leaky-bucket') {
      result = await leakyBucket(clientId, limit, windowSeconds);
    } else {
      return next(new Error('Unsupported algorithm'));
    }

    res.set('X-RateLimit-Limit', limit);
    res.set('X-RateLimit-Remaining', result.remaining);
    res.set('X-RateLimit-Reset', result.reset);

    // Record Telemetry asynchronously
    recordTelemetry(apiKey, result.allowed, result.remaining, result.reset, algorithm, req);

    if (!result.allowed) {
      res.set('Retry-After', result.retryAfter);
      return res.status(429).json({
        error: 'Too Many Requests',
        retryAfter: result.retryAfter
      });
    }

    next();
  } catch (err) {
    console.error('Rate limiter error:', err);
    next(err);
  }
}

module.exports = rateLimiter;