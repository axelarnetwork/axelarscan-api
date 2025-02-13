const { getBalances } = require('./account');
const { ENVIRONMENT } = require('../../utils/config');
const { toArray } = require('../../utils/parser');
const { toNumber } = require('../../utils/number');

module.exports = async () => {
  const denom = ENVIRONMENT === 'devnet-verifiers' ? 'uverifiers' : ENVIRONMENT === 'devnet-amplifier' ? 'uamplifier' : 'uaxl';
  const { data } = { ...await getBalances({ address: 'axelar1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqecnww6' }) };
  return toNumber(toArray(data).find(d => d.denom === `burned-${denom}`)?.amount);
};