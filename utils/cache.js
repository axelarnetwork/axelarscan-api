const moment = require('moment');

const { get, write } = require('../services/indexer');
const { toJson, split } = require('./parser');
const { isString } = require('./string');
const { timeDiff } = require('./time');

const CACHE_COLLECTION = 'cache';

const readCache = async (cacheId, cacheAge = 300, collection = CACHE_COLLECTION) => {
  if (!cacheId) return;

  // get cache by id
  const { data, updated_at } = { ...await get(collection, normalizeCacheId(cacheId)) };

  // cache hit and not expired
  if (toJson(data) && timeDiff(updated_at) < cacheAge) {
    // return cache data
    return toJson(data);
  }

  return;
};

const writeCache = async (cacheId, data, collection = CACHE_COLLECTION, useRawData = false) => {
  if (!cacheId) return;

  // write cache
  await write(collection, normalizeCacheId(cacheId), { data: useRawData ? data : JSON.stringify(data), updated_at: moment().valueOf() });
};

const normalizeCacheId = id => isString(id) ? split(id, { delimiter: '/' }).join('_') : undefined;

module.exports = {
  readCache,
  writeCache,
  normalizeCacheId,
};