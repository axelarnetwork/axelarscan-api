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
  const { denom, name } = { ...(await getAssetData(symbol) || await getITSAssetData(symbol)) };

  // get token price
  const pricesData = { ...await getTokensPrice({ symbol, timestamp }) };
  const { price } = { ...(pricesData[symbol] || Object.values(pricesData).find(d => d.denom === symbol)) };

  const supplyData = await getCirculatingSupply({ symbol, height, debug: true });
  const circulatingSupply = supplyData?.circulating_supply;

  const isAXL = ['uaxl', 'uamplifier'].includes(denom);
  const totalSupply = isAXL ? await getTotalSupply({ asset: denom, height }) : null;
  const totalBurned = isAXL ? await getTotalBurned({ height }) : null;
  const { inflation } = { ...(isAXL ? await getInflation({ height }) : undefined) };

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