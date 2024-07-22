const { ENVIRONMENT, getAssetData, getLCD } = require('../../utils/config');
const { request } = require('../../utils/http');
const { formatUnits } = require('../../utils/number');

module.exports = async params => {
  const { asset } = { ...params };
  const { decimals, addresses } = { ...await getAssetData(asset || (ENVIRONMENT === 'devnet-verifiers' ? 'uverifiers' : ENVIRONMENT === 'devnet-amplifier' ? 'uamplifier' : 'uaxl')) };
  const { ibc_denom } = { ...addresses?.axelarnet };
  if (!ibc_denom) return;

  const response = await request(getLCD(), { path: `/cosmos/bank/v1beta1/supply/${ibc_denom}` });
  const { amount } = { ...response?.amount };
  return formatUnits(amount, decimals);
};