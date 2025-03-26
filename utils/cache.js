const moment = require('moment');

const { get, read, write } = require('../services/indexer');
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

const readMultipleCache = async (cacheIds, cacheAge = 300, collection = CACHE_COLLECTION) => {
  if (!cacheIds) return;

  // query cache by ids and not expired
  const { data } = { ...await read(collection, {
    bool: {
      must: [{ range: { updated_at: { gte: moment().subtract(cacheAge, 'seconds').valueOf() } } }],
      should: cacheIds.map(id => ({ match: { _id: normalizeCacheId(id) } })),
      minimum_should_match: 1,
    },
  }, { size: cacheIds.length }) };

  return data;
};

const writeCache = async (cacheId, data, collection = CACHE_COLLECTION, useRawData = false) => {
  if (!cacheId) return;

  // write cache
  await write(collection, normalizeCacheId(cacheId), { data: useRawData ? data : JSON.stringify(data), updated_at: moment().valueOf() });
};

const normalizeCacheId = id => isString(id) ? split(id, { delimiter: '/', toCase: 'lower' }).join('_') : undefined;

module.exports = {
  readCache,
  readMultipleCache,
  writeCache,
  normalizeCacheId,
};