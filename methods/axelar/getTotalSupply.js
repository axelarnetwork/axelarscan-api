const { getLCDInstance } = require('./utils');
const { ENVIRONMENT, getAssetData } = require('../../utils/config');
const { request } = require('../../utils/http');
const { formatUnits } = require('../../utils/number');

module.exports = async params => {
  const { asset, height } = { ...params };

  // get asset data (default: AXL)
  const { decimals, addresses } = { ...(params?.assetData || await getAssetData(asset || (ENVIRONMENT === 'devnet-amplifier' ? 'uamplifier' : 'uaxl'))) };
  const { ibc_denom } = { ...addresses?.axelarnet };
  if (!ibc_denom) return;

  // request /supply/{denom}
  const { amount } = { ...await request(getLCDInstance(height), { path: `/cosmos/bank/v1beta1/supply/${ibc_denom}` }) };

  return formatUnits(amount?.amount, decimals);
};