const _ = require('lodash');

const { getLCDInstance } = require('../utils');
const { getAssets, getAssetData } = require('../../../utils/config');
const { request } = require('../../../utils/http');
const { toArray } = require('../../../utils/parser');
const { isString } = require('../../../utils/string');
const { formatUnits } = require('../../../utils/number');

module.exports = async params => {
  const { address, height } = { ...params };
  let { assetsData } = { ...params };

  // check address param is axelar address
  if (!address?.startsWith('axelar')) return;

  assetsData = assetsData || await getAssets();

  let data = [];
  let nextKey = true;

  while (nextKey) {
    // get delegations of this address
    const { delegation_responses, pagination } = { ...await request(getLCDInstance(height), { path: `/cosmos/staking/v1beta1/delegations/${address}`, params: { 'pagination.key': isString(nextKey) ? nextKey : undefined } }) };

    data = _.orderBy(_.uniqBy(
      _.concat(data, await Promise.all(toArray(delegation_responses).map(d => new Promise(async resolve => {
        const { delegation, balance } = { ...d };
        const { shares } = { ...delegation };
        const { denom, amount } = { ...balance };
        const { symbol, decimals } = { ...await getAssetData(denom, assetsData) };

        resolve({
          ...delegation,
          shares: formatUnits(shares, decimals || 6),
          ...balance,
          symbol,
          amount: formatUnits(amount, decimals || 6),
        });
      })))),
      'validator_address',
    ), ['amount'], ['desc']);

    nextKey = pagination?.next_key;
  }

  return { data, total: data.length };
};