const { TOKEN_API } = require('../../utils/config');
const { readCache, writeCache } = require('../../utils/cache');
const { request } = require('../../utils/http');

module.exports = async () => {
  const cacheId = 'rates';

  // get rates from cache
  const cache = await readCache(cacheId, 300);
  if (cache) return cache;

  // get rates from api
  const { rates } = { ...await request(TOKEN_API, { path: '/exchange_rates' }) };

  if (rates) {
    // caching
    await writeCache(cacheId, rates);
    return rates;
  }

  return await readCache(cacheId, 24 * 3600);
};