// src/utils/memoryCache.js
class MemoryCache {
  constructor() {
    this.cache = new Map();
    this.ttl = new Map();
  }
  set(key, value, ttlSeconds = 3600) {
    this.cache.set(key, value);
    this.ttl.set(key, Date.now() + ttlSeconds * 1000);
    setTimeout(() => this.delete(key), ttlSeconds * 1000);
  }

  get(key) {
    if (this.ttl.get(key) && Date.now() > this.ttl.get(key)) {
      this.delete(key);
      return null;
    }
    return this.cache.get(key);
  }

  delete(key) {
    this.cache.delete(key);
    this.ttl.delete(key);
  }

  clear() {
    this.cache.clear();
    this.ttl.clear();
  }
};




export const memoryCache = new MemoryCache();
