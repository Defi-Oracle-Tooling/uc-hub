const Redis = require('ioredis');
const config = require('config');

class RedisClient {
  constructor() {
    this.client = null;
    this.initializeClient();
  }

  initializeClient() {
    try {
      this.client = new Redis({
        host: config.get('redis.host'),
        port: config.get('redis.port'),
        password: config.get('redis.password'),
        retryStrategy: (times) => {
          const delay = Math.min(times * 50, 2000);
          return delay;
        },
        maxRetriesPerRequest: 3
      });

      this.client.on('error', (error) => {
        console.error('Redis connection error:', error);
      });

      this.client.on('connect', () => {
        console.log('Connected to Redis');
      });
    } catch (error) {
      console.error('Failed to initialize Redis client:', error);
      throw error;
    }
  }

  async get(key) {
    try {
      return await this.client.get(key);
    } catch (error) {
      console.error('Redis get error:', error);
      throw error;
    }
  }

  async set(key, value) {
    try {
      return await this.client.set(key, value);
    } catch (error) {
      console.error('Redis set error:', error);
      throw error;
    }
  }

  async setex(key, seconds, value) {
    try {
      return await this.client.setex(key, seconds, value);
    } catch (error) {
      console.error('Redis setex error:', error);
      throw error;
    }
  }

  async del(key) {
    try {
      return await this.client.del(key);
    } catch (error) {
      console.error('Redis del error:', error);
      throw error;
    }
  }

  async incr(key) {
    try {
      return await this.client.incr(key);
    } catch (error) {
      console.error('Redis incr error:', error);
      throw error;
    }
  }

  async expire(key, seconds) {
    try {
      return await this.client.expire(key, seconds);
    } catch (error) {
      console.error('Redis expire error:', error);
      throw error;
    }
  }

  async keys(pattern) {
    try {
      return await this.client.keys(pattern);
    } catch (error) {
      console.error('Redis keys error:', error);
      throw error;
    }
  }

  async multi() {
    return this.client.multi();
  }

  async quit() {
    try {
      await this.client.quit();
    } catch (error) {
      console.error('Redis quit error:', error);
      throw error;
    }
  }
}

module.exports = new RedisClient();