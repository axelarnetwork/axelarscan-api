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
    // get unbonding delegations of this address
    const { unbonding_responses, pagination } = {
      ...(await request(getLCDInstance(height), {
        path: `/cosmos/staking/v1beta1/delegators/${address}/unbonding_delegations`,
        params: { 'pagination.key': isString(nextKey) ? nextKey : undefined },
      })),
    };

    data = _.orderBy(
      _.concat(
        data,
        toArray(unbonding_responses).flatMap(d => {
          const { entries } = { ...d };

          return toArray(entries).map(e => {
            const { creation_height } = { ...e };
            let { initial_balance, balance } = { ...e };

            initial_balance = formatUnits(initial_balance, 6);
            balance = formatUnits(balance, 6);

            return {
              ...d,
              entries: undefined,
              ...e,
              creation_height: toNumber(creation_height),
              initial_balance,
              balance,
              amount: balance,
            };
          });
        })
      ),
      ['creation_height', 'amount'],
      ['desc', 'desc']
    );

    nextKey = pagination?.next_key;
  }

  return { data, total: data.length };
};
