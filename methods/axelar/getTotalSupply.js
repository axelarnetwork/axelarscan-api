const { getLCDInstance } = require('./utils');
const { ENVIRONMENT, getAssetData } = require('../../utils/config');
const { request } = require('../../utils/http');
const { formatUnits } = require('../../utils/number');

module.exports = async params => {
  const { asset, height } = { ...params };

  // get asset data (default: AXL)
  const { decimals, addresses } = {
    ...(params?.assetData ||
      (await getAssetData(
        asset || (ENVIRONMENT === 'devnet-amplifier' ? 'uamplifier' : 'uaxl')
      ))),
  };
  const { ibc_denom } = { ...addresses?.axelarnet };
  if (!ibc_denom) return;

  // request /supply and search for denom
  let supply;
  let nextKey = true;
  const { equalsIgnoreCase, isString } = require('../../utils/string');
  const { toArray } = require('../../utils/parser');

  while (nextKey) {
    const response = await request(getLCDInstance(height), {
      path: '/cosmos/bank/v1beta1/supply',
      params: {
        'pagination.limit': 3000,
        'pagination.key': isString(nextKey) ? nextKey : undefined,
      },
    });

    if (!response?.supply) break;

    // find amount of this denom from response
    supply = toArray(response?.supply).find(d =>
      equalsIgnoreCase(d.denom, ibc_denom)
    )?.amount;

    nextKey = response?.pagination?.next_key;

    // break when already got supply
    if (nextKey && supply) break;
  }

  return supply ? formatUnits(supply, decimals) : undefined;
};
