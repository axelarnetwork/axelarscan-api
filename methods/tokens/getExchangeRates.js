const { readCache, writeCache } = require('../../utils/cache');
const { requestTokenAPI } = require('../../utils/coingecko');

module.exports = async () => {
  const cacheId = 'rates';

  // get rates from cache
  const cache = await readCache(cacheId, 300);
  if (cache) return cache;

  // get rates from api
  const { rates } = {
    ...(await requestTokenAPI({ path: '/exchange_rates' })),
  };

  if (rates) {
    // caching
    await writeCache(cacheId, rates);
    return rates;
  }

  return await readCache(cacheId, 24 * 3600);
};
