const _ = require('lodash');
const moment = require('moment');

const { TOKEN_PRICE_COLLECTION, TOKEN_API, CURRENCY, getAssets, getAssetData, getITSAssets, getITSAssetData, getTokens, getCustomTVLConfig } = require('../../utils/config');
const { readCache, readMultipleCache, writeCache } = require('../../utils/cache');
const { request } = require('../../utils/http');
const { toCase, toArray } = require('../../utils/parser');
const { lastString } = require('../../utils/string');
const { isNumber, toNumber } = require('../../utils/number');
const { timeDiff } = require('../../utils/time');

const tokens = getTokens();
const { custom_contracts, custom_tokens } = { ...getCustomTVLConfig() };

const getTokenConfig = async (symbol, assetsData, noRequest = false) => {
  let tokenData;

  // key in tokens config
  if (tokens[symbol]) {
    tokenData = tokens[symbol];
  }
  // full denom to key in tokens config
  else if (tokens[toCase(lastString(symbol, '/'), 'lower')]) {
    tokenData = tokens[toCase(lastString(symbol, '/'), 'lower')];
  }
  // custom token in contracts of tvl
  if (!tokenData) {
    const customTokenInContracts = _.head(toArray(toArray(custom_contracts).map(d => toArray(d.assets).find(a => a.symbol === symbol && a.coingecko_id))));

    if (customTokenInContracts) {
      tokenData = customTokenInContracts;
    }
  }
  // custom token of tvl
  if (!tokenData) {
    const customToken = toArray(custom_tokens).find(d => d.symbol === symbol && d.coingecko_id);

    if (customToken) {
      tokenData = customToken;
    }
  }
  // from s3 config
  if (!tokenData && !noRequest) {
    tokenData = await getAssetData(symbol, assetsData) || await getITSAssetData(symbol, assetsData);
  }

  // recursive getTokenConfig when has redirect
  if (tokenData?.redirect) {
    return await getTokenConfig(tokenData.redirect, assetsData, noRequest);
  }

  return tokenData;
};

module.exports = async ({ symbols, symbol, timestamp = moment(), currency = CURRENCY, assetsData }) => {
  // merge symbols and remove 'burned-' prefix
  symbols = _.uniq(toArray(_.concat(symbols, symbol)).map(s => s.startsWith('burned-') ? s.replace('burned-', '') : s));

  // valid when some symbols are in config
  const isSymbolsValid = toArray(
    await Promise.all(
      symbols.map(s => new Promise(async resolve =>
        resolve(await getTokenConfig(s, assetsData, true))
      ))
    )
  ).length > 0;

  // get assets data
  if (!assetsData) {
    assetsData = !isSymbolsValid ? undefined :
      toArray(
        await Promise.all(['gateway', 'its'].map(type => new Promise(async resolve => {
          let data;

          switch (type) {
            case 'gateway':
              data = await getAssets();
              break;
            case 'its':
              data = await getITSAssets();
              break;
            default:
              break;
          }

          resolve(data);
        })))
      ).flatMap(d => d);
  }

  // get token config of each symbol
  let tokensData = await Promise.all(
    symbols.map(s => new Promise(async resolve =>
      resolve({
        symbol: s,
        ...await getTokenConfig(s, assetsData),
      })
    ))
  );

  if (tokensData.findIndex(d => d.coingecko_id) > -1) {
    // query historical price
    if (timeDiff(timestamp, 'hours') > 4) {
      for (let i = 0; i < tokensData.length; i++) {
        const { coingecko_id } = { ...tokensData[i] };

        if (coingecko_id) {
          // get historical price from coingecko
          const { market_data } = { ...await request(TOKEN_API, { path: `/coins/${coingecko_id}/history`, params: { id: coingecko_id, date: moment(timestamp).format('DD-MM-YYYY'), localization: 'false' } }) };

          if (market_data?.current_price) {
            tokensData[i] = {
              ...tokensData[i],
              price: market_data.current_price[currency],
            };
          }
        }
      }
    }

    // query current price
    if (tokensData.findIndex(d => !isNumber(d.price)) > -1) {
      // coingecko ids
      const ids = _.uniq(toArray(tokensData.map(d => d.coingecko_id)));

      const cacheId = ids.length === 1 && ids[0];
      let response;

      // get price from cache
      if (cacheId) {
        const cache = await readCache(cacheId, 300, TOKEN_PRICE_COLLECTION);
        if (cache) {
          response = cache;
        }
      }
      else {
        // get tokens price from cache
        const data = await readMultipleCache(ids, 300, TOKEN_PRICE_COLLECTION);

        if (toArray(data).length >= ids.length) {
          response = Object.fromEntries(data.flatMap(d => Object.entries(d.data)));
        }
      }

      if (!response) {
        // get tokens price from coingecko
        response = await request(TOKEN_API, { path: '/simple/price', params: { ids: ids.join(','), vs_currencies: currency } });

        if (response && !response.error) {
          if (timeDiff(timestamp, 'minutes') < 5) {
            // caching
            if (cacheId) {
              await writeCache(cacheId, response, TOKEN_PRICE_COLLECTION, true);
            }
            else {
              for (const [k, v] of Object.entries(response)) {
                await writeCache(k, { [k]: v }, TOKEN_PRICE_COLLECTION, true);
              }
            }
          }
        }
        else {
          // return old data when api is not available
          if (cacheId) {
            response = await readCache(cacheId, 4 * 3600, TOKEN_PRICE_COLLECTION);
          }
          else {
            const data = await readMultipleCache(ids, 4 * 3600, TOKEN_PRICE_COLLECTION);

            if (toArray(data).length > 0) {
              response = Object.fromEntries(data.flatMap(d => Object.entries(d.data)));
            }
          }
        }
      }

      if (response) {
        // set price to tokens
        tokensData = tokensData.map(d => {
          if (isNumber(response[d.coingecko_id]?.[currency])) {
            d.price = toNumber(response[d.coingecko_id][currency]);
          }
          return d;
        });
      }
    }
  }

  // set default price when price from api is available
  tokensData = tokensData.map(d => {
    if (!isNumber(d.price) && isNumber(d.default_price?.[currency])) {
      d.price = toNumber(d.default_price[currency]);
    }
    return d;
  });

  // return tokens price map
  return Object.fromEntries(tokensData.map(d => [d.symbol, d]));
};