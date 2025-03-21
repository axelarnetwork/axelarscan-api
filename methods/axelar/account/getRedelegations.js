const _ = require('lodash');

const { getLCDInstance } = require('../utils');
const { request } = require('../../../utils/http');
const { toArray } = require('../../../utils/parser');
const { isString } = require('../../../utils/string');
const { toNumber, formatUnits } = require('../../../utils/number');

module.exports = async params => {
  const { address, height } = { ...params };

  // check address param is axelar address
  if (!address?.startsWith('axelar')) return;

  let data = [];
  let nextKey = true;

  while (nextKey) {
    // get redelegations of this address
    const { redelegation_responses, pagination } = { ...await request(getLCDInstance(height), { path: `/cosmos/staking/v1beta1/delegators/${address}/redelegations`, params: { 'pagination.key': isString(nextKey) ? nextKey : undefined } }) };

    data = _.orderBy(
      _.concat(data, toArray(redelegation_responses).flatMap(d => {
        const { redelegation } = { ...d };
        const { entries } = { ...redelegation };

        return toArray(entries).map(e => {
          const { creation_height } = { ...e };
          let { initial_balance, shares_dst } = { ...e };

          initial_balance = formatUnits(initial_balance, 6);
          shares_dst = formatUnits(shares_dst, 6);

          return {
            ...redelegation,
            entries: undefined,
            ...e,
            creation_height: toNumber(creation_height),
            initial_balance,
            shares_dst,
            amount: shares_dst - initial_balance,
          };
        });
      })),
      ['creation_height', 'amount'], ['desc', 'desc'],
    );

    nextKey = pagination?.next_key;
  }

  return { data, total: data.length };
};