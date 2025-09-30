const { getBalances } = require('./account');
const { ENVIRONMENT } = require('../../utils/config');
const { toArray } = require('../../utils/parser');
const { toNumber } = require('../../utils/number');

module.exports = async params => {
  // get balances of burned address
  const { data } = {
    ...(await getBalances({
      ...params,
      address:
        'axelar1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqecnww6',
    })),
  };

  // return amount of burned-{denom}
  const denom = ENVIRONMENT === 'devnet-amplifier' ? 'uamplifier' : 'uaxl';
  return toNumber(
    toArray(data).find(d => d.denom === `burned-${denom}`)?.amount
  );
};
