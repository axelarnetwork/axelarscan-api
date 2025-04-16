const moment = require('moment');

const getTotalSupply = require('./getTotalSupply');
const getCirculatingSupply = require('./getCirculatingSupply');
const getTotalBurned = require('./getTotalBurned');
const getInflation = require('./getInflation');
const { getBlockTimestamp } = require('./utils');
const { getTokensPrice, getExchangeRates } = require('../tokens');
const { ENVIRONMENT, CURRENCY, getAssetData, getITSAssetData } = require('../../utils/config');
const { toCase } = require('../../utils/parser');

module.exports = async params => {
  const { agent, height } = { ...params };
  let { symbol } = { ...params };

  // default: AXL
  symbol = symbol || (ENVIRONMENT === 'devnet-amplifier' ? 'AMPLIFIER' : 'AXL');

  // getBlockTimestamp when specific height
  const timestamp = height ? await getBlockTimestamp(height) : moment().valueOf();

  // get asset data (gateway | ITS)
  const assetData = { ...(await getAssetData(symbol) || await getITSAssetData(symbol)) };
  const { denom, name } = { ...assetData };

  const isAXL = ['uaxl', 'uamplifier'].includes(denom);

  const [price, supplyData, totalSupply, totalBurned, inflation] = await Promise.all(
    ['price', 'circulatingSupply', 'totalSupply', 'totalBurned', 'inflation'].map(k => new Promise(async resolve => {
      switch (k) {
        case 'price':
          const pricesData = await getTokensPrice({ symbol, timestamp, assetsData: assetData });
          const { price } = { ...(pricesData[symbol] || Object.values(pricesData).find(d => d.denom === symbol)) };
          resolve(price);
          break;
        case 'circulatingSupply':
          resolve(await getCirculatingSupply({ symbol, height, debug: true, assetData }));
          break;
        case 'totalSupply':
          resolve(isAXL ? await getTotalSupply({ asset: denom, height, assetData }) : null);
          break;
        case 'totalBurned':
          resolve(isAXL ? await getTotalBurned({ height, assetsData: assetData }) : null);
          break;
        case 'inflation':
          resolve(isAXL ? (await getInflation({ height }))?.inflation : null);
          break;
        default:
          resolve();
          break;
      }
    }))
  );

  const circulatingSupply = supplyData?.circulating_supply;
  const updatedAt = supplyData?.updated_at || moment().valueOf();

  switch (agent) {
    case 'upbit':
      const exchangeRates = await getExchangeRates();

      return ['KRW', 'USD', 'IDR', 'SGD', 'THB'].map(currencyCode => {
        const currency = toCase(currencyCode, 'lower');

        // convert price of each currency
        const priceConverted = price * (exchangeRates?.[currency] && currency !== CURRENCY ? exchangeRates[currency].value / exchangeRates[CURRENCY].value : 1);

        return {
          symbol,
          currencyCode,
          price: priceConverted,
          marketCap: circulatingSupply * priceConverted,
          circulatingSupply,
          maxSupply: totalSupply,
          totalBurned,
          inflation,
          provider: 'Axelar',
          lastUpdatedTimestamp: updatedAt,
        };
      });
    default:
      return {
        symbol,
        name,
        price,
        marketCap: circulatingSupply * price,
        circulatingSupply,
        maxSupply: totalSupply,
        totalBurned,
        inflation,
        updatedAt,
        timestamp,
      };
  }
};