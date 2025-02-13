const _ = require('lodash');

const { ENVIRONMENT, getLCD } = require('../../../utils/config');
const { createInstance, request } = require('../../../utils/http');
const { toArray } = require('../../../utils/parser');
const { toNumber, formatUnits } = require('../../../utils/number');

module.exports = async params => {
  const { address, height } = { ...params };
  if (!address?.startsWith('axelar')) return;

  const headers = height ? { 'x-cosmos-block-height': height } : undefined;
  const instance = createInstance(getLCD(ENVIRONMENT, !!height), { gzip: true, headers });

  let data = [];
  let nextKey = true;
  while (nextKey) {
    const { unbonding_responses, pagination } = { ...await request(instance, { path: `/cosmos/staking/v1beta1/delegators/${address}/unbonding_delegations`, params: { 'pagination.key': nextKey && typeof nextKey !== 'boolean' ? nextKey : undefined } }) };
    data = _.orderBy(_.concat(toArray(data), toArray(unbonding_responses).flatMap(d => {
      const { entries } = { ...d };
      return toArray(entries).map(e => {
        const { creation_height } = { ...e };
        let { initial_balance, balance } = { ...e };
        initial_balance = formatUnits(initial_balance, 6);
        balance = formatUnits(balance, 6);
        return { ...d, entries: undefined, ...e, creation_height: toNumber(creation_height), initial_balance, balance, amount: balance };
      });
    })), ['creation_height', 'amount'], ['desc', 'desc']);
    nextKey = pagination?.next_key;
  }
  return { data, total: data.length };
};