const { aggregate } = require('./utils');
const { ENVIRONMENT, getAssetsList, getLCD } = require('../../../utils/config');
const { createInstance, request } = require('../../../utils/http');
const { toArray } = require('../../../utils/parser');

module.exports = async params => {
  const { address, height } = { ...params };
  let { assetsData } = { ...params };
  if (!address?.startsWith('axelar')) return;

  const headers = height ? { 'x-cosmos-block-height': height } : undefined;
  const instance = createInstance(getLCD(ENVIRONMENT, !!height), { gzip: true, headers });
  const { rewards, total } = { ...await request(instance, { path: `/cosmos/distribution/v1beta1/delegators/${address}/rewards` }) };
  assetsData = assetsData || (rewards ? await getAssetsList() : undefined);

  return {
    rewards: await aggregate(toArray(rewards).flatMap(d => d.reward), assetsData),
    rewards_by_validator: Object.fromEntries(await Promise.all(toArray(rewards).map(d => new Promise(async resolve => resolve([d.validator_address, await aggregate(d.reward, assetsData)]))))),
    total: await aggregate(total, assetsData),
  };
};