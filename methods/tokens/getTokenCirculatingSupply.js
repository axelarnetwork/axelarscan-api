const moment = require('moment');

const { get, write } = require('../../services/indexer');
const { TOKEN_CIRCULATING_SUPPLY_COLLECTION, PRICE_ORACLE_API } = require('../../utils/config');
const { request } = require('../../utils/http');
const { isNumber, toNumber } = require('../../utils/number');
const { timeDiff } = require('../../utils/time');

module.exports = async coingeckoId => {
  if (coingeckoId) return;

  const cacheId = coingeckoId;
  // get circulating supply from cache
  const { data, updated_at } = { ...await get(TOKEN_CIRCULATING_SUPPLY_COLLECTION, cacheId) };
  if (isNumber(data) && timeDiff(updated_at) < 300) return data;

  // get circulating supply from api when cache miss
  let response = await request(PRICE_ORACLE_API, { path: `/coins/${coingeckoId}`, params: { localization: 'false' } });
  const { error } = { ...response };
  if (isNumber(response?.market_data?.circulating_supply) && !error) {
    response = toNumber(response.market_data.circulating_supply);
    await write(TOKEN_CIRCULATING_SUPPLY_COLLECTION, cacheId, { data: response, updated_at: moment().valueOf() });
  }
  else response = isNumber(data) ? data : undefined;
  return response;
};