const { aggregate } = require('./utils');
const { ENVIRONMENT, getAssetsList, getLCD } = require('../../../utils/config');
const { createInstance, request } = require('../../../utils/http');
const { bech32ToBech32, toArray } = require('../../../utils/parser');

module.exports = async params => {
  const { height } = { ...params };
  let { address, assetsData } = { ...params };
  if (!address?.startsWith('axelar')) return;
  const prefix = 'axelarvaloper';
  if (!address.startsWith(prefix)) {
    try {
      address = bech32ToBech32(address, prefix);
    } catch (error) {
      return;
    }
  }

  const headers = height ? { 'x-cosmos-block-height': height } : undefined;
  const instance = createInstance(getLCD(ENVIRONMENT, !!height), { gzip: true, headers });
  const { commission } = { ...await request(instance, { path: `/cosmos/distribution/v1beta1/validators/${address}/commission` }) };
  assetsData = assetsData || (commission ? await getAssetsList() : undefined);
  return await aggregate(toArray(commission?.commission), assetsData);
};