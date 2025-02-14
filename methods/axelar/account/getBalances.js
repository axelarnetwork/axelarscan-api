const _ = require('lodash');

const { aggregate } = require('./utils');
const { ENVIRONMENT, getAssetsList, getLCD } = require('../../../utils/config');
const { createInstance, request } = require('../../../utils/http');
const { toArray } = require('../../../utils/parser');

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
    const { balances, pagination } = { ...await request(instance, { path: `/cosmos/bank/v1beta1/balances/${address}`, params: { 'pagination.key': nextKey && typeof nextKey !== 'boolean' ? nextKey : undefined } }) };
    data = _.orderBy(_.uniqBy(_.concat(toArray(data), await aggregate(balances, assetsData, { includesValue: true })), 'denom'), ['value', 'amount'], ['desc', 'desc']);
    nextKey = pagination?.next_key;
  }
  return { data, total: data.length };
};