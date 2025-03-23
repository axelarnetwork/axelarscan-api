const _ = require('lodash');

const { getTokensPrice } = require('../../tokens');
const { getAssetData } = require('../../../utils/config');
const { toArray } = require('../../../utils/parser');
const { isNumber, formatUnits } = require('../../../utils/number');

const aggregate = async (data, assetsData, options) => {
  const { includesValue } = { ...options };

  // filter data that has amount
  const validData = toArray(data).filter(d => isNumber(d.amount));

  // get all tokens data
  const tokensData = toArray(await Promise.all(validData.map(d => new Promise(async resolve => resolve(await getAssetData(d.denom, assetsData))))));

  // get tokens price
  const pricesData = { ...(includesValue ? await getTokensPrice({ symbols: tokensData.map(d => d.denom) }) : undefined) };

  return Object.entries(
    _.groupBy(validData.map((d, i) => {
      const assetData = tokensData[i];
      const { denom, symbol, decimals } = { ...assetData };

      const amount = formatUnits(d.amount, decimals || 6);
      const { price } = { ...(pricesData[denom] || Object.values(pricesData).find(d => d.denom === denom)) };
      const value = isNumber(price) ? amount * price : undefined;

      return {
        ...d,
        symbol,
        amount,
        price,
        value,
        asset_data: assetData,
      };
    }), 'denom')
  )
  .map(([k, v]) => ({
    denom: k,
    ..._.head(v),
    amount: _.sumBy(v, 'amount'),
    value: _.sumBy(v, 'value'),
  }));
};

module.exports = {
  aggregate,
};