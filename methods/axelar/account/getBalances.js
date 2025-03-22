const _ = require('lodash');

const { aggregate } = require('./utils');
const { getLCDInstance } = require('../utils');
const { getAssets } = require('../../../utils/config');
const { request } = require('../../../utils/http');
const { toArray } = require('../../../utils/parser');
const { isString } = require('../../../utils/string');

module.exports = async params => {
  const { address, height } = { ...params };
  let { assetsData } = { ...params };

  // check address param is axelar address
  if (!address?.startsWith('axelar')) return;

  assetsData = toArray(assetsData || await getAssets());

  let data = [];
  let nextKey = true;

  while (nextKey) {
    // get balances of this address
    const { balances, pagination } = { ...await request(getLCDInstance(height), { path: `/cosmos/bank/v1beta1/balances/${address}`, params: { 'pagination.key': isString(nextKey) ? nextKey : undefined } }) };

    data = _.orderBy(
      _.uniqBy(_.concat(
        data,
        await aggregate(balances, assetsData, { includesValue: true }),
      ), 'denom'),
      ['value', 'amount'], ['desc', 'desc'],
    );

    nextKey = pagination?.next_key;
  }

  return { data, total: data.length };
};