const client = require('../src/redis');

async function listKeys() {
  console.log('🔍 Querying active keys in Upstash Redis...\n');
  try {
    const keys = await client.keys('*');
    if (keys.length === 0) {
      console.log('Redis is currently empty.');
      return;
    }

    console.log(`Found ${keys.length} keys:\n`);

    for (const key of keys) {
      const type = await client.type(key);
      let value;

      if (type === 'string') {
        value = await client.get(key);
      } else if (type === 'hash') {
        value = await client.hgetall(key);
      } else if (type === 'list') {
        value = await client.lrange(key, 0, 2); // get first 3 items
      } else {
        value = '(complex data type)';
      }

      console.log(`🔑 Key:  ${key}`);
      console.log(`   Type: ${type}`);
      console.log(`   Data:`, typeof value === 'object' ? JSON.stringify(value, null, 2) : value);
      console.log('─'.repeat(40));
    }
  } catch (err) {
    console.error('Failed to list Redis keys:', err);
  }
}

listKeys();
