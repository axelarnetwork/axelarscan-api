const { ENVIRONMENT, getAssetData, getLCD } = require('../../utils/config');
const { createInstance, request } = require('../../utils/http');
const { formatUnits } = require('../../utils/number');

module.exports = async params => {
  const { asset, height } = { ...params };
  const { decimals, addresses } = { ...await getAssetData(asset || (ENVIRONMENT === 'devnet-amplifier' ? 'uamplifier' : 'uaxl')) };
  const { ibc_denom } = { ...addresses?.axelarnet };
  if (!ibc_denom) return;

  const headers = height ? { 'x-cosmos-block-height': height } : undefined;
  const instance = createInstance(getLCD(ENVIRONMENT, !!height), { gzip: true, headers });
  const response = await request(instance, { path: `/cosmos/bank/v1beta1/supply/${ibc_denom}` });
  const { amount } = { ...response?.amount };
  return formatUnits(amount, decimals);
};