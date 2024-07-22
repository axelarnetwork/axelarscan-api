const moment = require('moment');

const getTotalSupply = require('./getTotalSupply');
const getCirculatingSupply = require('./getCirculatingSupply');
const { getTokensPrice, getExchangeRates } = require('../tokens');
const { CURRENCY, getAssetData, getITSAssetData } = require('../../utils/config');

module.exports = async params => {
  const { agent } = { ...params };
  let { symbol } = { ...params };
  symbol = symbol || 'AXL';

  const { denom, name } = { ...(await getAssetData(symbol) || await getITSAssetData(symbol)) };
  const { data, updated_at } = { ...await getTokensPrice({ symbol, currency: CURRENCY, debug: true }) };
  const { price } = { ...(data?.[symbol] || Object.values({ ...data }).find(d => d.denom === symbol)) };
  const supplyData = await getCirculatingSupply({ symbol, debug: true });
  const circulatingSupply = supplyData?.circulating_supply;
  const totalSupply = ['uaxl', 'uverifiers', 'uamplifier'].includes(denom) ? await getTotalSupply({ asset: denom }) : null;
  const updatedAt = supplyData?.updated_at || updated_at || moment().valueOf();

  switch (agent) {
    case 'upbit':
      const exchangeRates = await getExchangeRates();
      return ['KRW', 'USD', 'IDR', 'SGD', 'THB'].map(currencyCode => {
        const currency = currencyCode.toLowerCase();
        const _price = price * (exchangeRates?.[currency] && currency !== CURRENCY ? exchangeRates[currency].value / exchangeRates[CURRENCY].value : 1);
        return { symbol, currencyCode, price: _price, marketCap: circulatingSupply * _price, circulatingSupply, maxSupply: totalSupply, provider: 'Axelar', lastUpdatedTimestamp: updatedAt };
      });
    default:
      return { symbol, name, price, marketCap: circulatingSupply * price, circulatingSupply, maxSupply: totalSupply, updatedAt };
  }
};