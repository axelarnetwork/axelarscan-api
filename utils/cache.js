const moment = require('moment');

const { get, write } = require('../services/indexer');
const { toJson } = require('./parser');
const { timeDiff } = require('./time');

const CACHE_COLLECTION = 'cache';

const readCache = async (cacheId, cacheAge = 300, collection = CACHE_COLLECTION) => {
  if (!cacheId) return;

  // get cache by id
  const { data, updated_at } = { ...await get(collection, cacheId) };

  // cache hit and not expired
  if (toJson(data) && timeDiff(updated_at) < cacheAge) {
    // return cache data
    return toJson(data);
  }

  return;
};

const writeCache = async (cacheId, data, collection = CACHE_COLLECTION) => {
  if (!cacheId) return;

  // write cache
  await write(collection, cacheId, { data: JSON.stringify(data), updated_at: moment().valueOf() });
};

module.exports = {
  readCache,
  writeCache,
};