const { aggregate } = require('./utils');
const { getLCDInstance } = require('../utils');
const { getAssets } = require('../../../utils/config');
const { request } = require('../../../utils/http');
const { bech32ToBech32, toArray } = require('../../../utils/parser');

module.exports = async params => {
  const { height } = { ...params };
  let { address, assetsData } = { ...params };

  // check address param is axelar address
  if (!address?.startsWith('axelar')) return;

  // parse to operator address
  const prefix = 'axelarvaloper';
  if (!address.startsWith(prefix)) {
    try {
      address = bech32ToBech32(address, prefix);
    } catch (error) {
      return;
    }
  }

  // get commission of this validator
  const { commission } = {
    ...(await request(getLCDInstance(height), {
      path: `/cosmos/distribution/v1beta1/validators/${address}/commission`,
    })),
  };

  // get assets data when has commission
  assetsData = assetsData || (commission ? await getAssets() : undefined);

  return await aggregate(toArray(commission?.commission), assetsData);
};
