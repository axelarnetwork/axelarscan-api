const _ = require('lodash');

const { ENVIRONMENT, getAssetsList, getAssetData, getLCD } = require('../../../utils/config');
const { createInstance, request } = require('../../../utils/http');
const { toArray } = require('../../../utils/parser');
const { formatUnits } = require('../../../utils/number');

module.exports = async params => {
  const { address, height } = { ...params };
  let { assetsData } = { ...params };
  if (!address?.startsWith('axelar')) return;

  assetsData = assetsData || await getAssetsList();
  const headers = height ? { 'x-cosmos-block-height': height } : undefined;
  const instance = createInstance(getLCD(ENVIRONMENT, !!height), { gzip: true, headers });

  let data = [];
  let nextKey = true;
  while (nextKey) {
    const { delegation_responses, pagination } = { ...await request(instance, { path: `/cosmos/staking/v1beta1/delegations/${address}`, params: { 'pagination.key': nextKey && typeof nextKey !== 'boolean' ? nextKey : undefined } }) };
    data = _.orderBy(_.uniqBy(_.concat(toArray(data), await Promise.all(toArray(delegation_responses).map(d => new Promise(async resolve => {
      const { delegation, balance } = { ...d };
      const { shares } = { ...delegation };
      const { denom, amount } = { ...balance };
      const { symbol, decimals } = { ...await getAssetData(denom, assetsData) };
      resolve({ ...delegation, shares: formatUnits(shares, decimals || 6), ...balance, symbol, amount: formatUnits(amount, decimals || 6) });
    })))), 'validator_address'), ['amount'], ['desc']);
    nextKey = pagination?.next_key;
  }
  return { data, total: data.length };
};