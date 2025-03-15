const moment = require('moment');

const getTotalSupply = require('./getTotalSupply');
const getCirculatingSupply = require('./getCirculatingSupply');
const getTotalBurned = require('./getTotalBurned');
const getInflation = require('./getInflation');
const { getTokensPrice, getExchangeRates } = require('../tokens');
const { ENVIRONMENT, CURRENCY, getAssetData, getITSAssetData, getLCD } = require('../../utils/config');
const { createInstance, request } = require('../../utils/http');

const getBlockTimestamp = async height => {
  if (!height) return;
  const instance = createInstance(getLCD(ENVIRONMENT, true), { gzip: true });
  const { block } = { ...await request(instance, { path: `/cosmos/base/tendermint/v1beta1/blocks/${height}` }) };
  const { time } = { ...block?.header };
  if (time) return moment(time).valueOf();
  return;
};

module.exports = async params => {
  const { agent, height } = { ...params };
  let { symbol } = { ...params };
  symbol = symbol || (ENVIRONMENT === 'devnet-amplifier' ? 'AMPLIFIER' : 'AXL');

  let timestamp = height ? undefined : moment().valueOf();
  while (height && !timestamp) timestamp = await getBlockTimestamp(height);

  const { denom, name } = { ...(await getAssetData(symbol) || await getITSAssetData(symbol)) };
  const { data, updated_at } = { ...await getTokensPrice({ symbol, timestamp, currency: CURRENCY, debug: true }) };
  const { price } = { ...(data?.[symbol] || Object.values({ ...data }).find(d => d.denom === symbol)) };
  const supplyData = await getCirculatingSupply({ symbol, height, debug: true });
  const circulatingSupply = supplyData?.circulating_supply;
  const isAXL = ['uaxl', 'uamplifier'].includes(denom);
  const totalSupply = isAXL ? await getTotalSupply({ asset: denom, height }) : null;
  const totalBurned = isAXL ? await getTotalBurned({ height }) : null;
  const { inflation } = { ...(isAXL ? await getInflation({ height }) : null) };
  const updatedAt = supplyData?.updated_at || updated_at || moment().valueOf();

  switch (agent) {
    case 'upbit':
      const exchangeRates = await getExchangeRates();
      return ['KRW', 'USD', 'IDR', 'SGD', 'THB'].map(currencyCode => {
        const currency = currencyCode.toLowerCase();
        const _price = price * (exchangeRates?.[currency] && currency !== CURRENCY ? exchangeRates[currency].value / exchangeRates[CURRENCY].value : 1);
        return { symbol, currencyCode, price: _price, marketCap: circulatingSupply * _price, circulatingSupply, maxSupply: totalSupply, totalBurned, inflation, provider: 'Axelar', lastUpdatedTimestamp: updatedAt };
      });
    default:
      return { symbol, name, price, marketCap: circulatingSupply * price, circulatingSupply, maxSupply: totalSupply, totalBurned, inflation, updatedAt, timestamp };
  }
};
