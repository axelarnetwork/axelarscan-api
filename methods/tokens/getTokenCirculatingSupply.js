const { TOKEN_API } = require('../../utils/config');
const { readCache, writeCache } = require('../../utils/cache');
const { request } = require('../../utils/http');
const { isNumber, toNumber } = require('../../utils/number');

module.exports = async coingeckoId => {
  if (!coingeckoId) return;
  const cacheId = coingeckoId;

  // get circulating supply from cache
  const cache = await readCache(cacheId, 300);
  if (cache) return cache.data;

  // get circulating supply from api
  const { market_data } = { ...await request(TOKEN_API, { path: `/coins/${coingeckoId}`, params: { localization: 'false' } }) };

  if (isNumber(market_data?.circulating_supply)) {
    const circulatingSupply = toNumber(market_data.circulating_supply);
    // caching
    await writeCache(cacheId, { data: circulatingSupply });
    return circulatingSupply;
  }

  return (await readCache(cacheId, 24 * 3600))?.data;
};