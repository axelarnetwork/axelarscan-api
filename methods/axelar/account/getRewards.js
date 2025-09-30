const { aggregate } = require('./utils');
const { getLCDInstance } = require('../utils');
const { getAssets } = require('../../../utils/config');
const { request } = require('../../../utils/http');
const { toArray } = require('../../../utils/parser');

module.exports = async params => {
  const { address, height } = { ...params };
  let { assetsData } = { ...params };

  // check address param is axelar address
  if (!address?.startsWith('axelar')) return;

  // get rewards of this address
  const { rewards, total } = {
    ...(await request(getLCDInstance(height), {
      path: `/cosmos/distribution/v1beta1/delegators/${address}/rewards`,
    })),
  };

  // get assets data when has rewards
  assetsData = assetsData || (rewards ? await getAssets() : undefined);

  return {
    rewards: await aggregate(
      toArray(rewards).flatMap(d => d.reward),
      assetsData
    ),
    rewards_by_validator: Object.fromEntries(
      await Promise.all(
        toArray(rewards).map(
          d =>
            new Promise(async resolve =>
              resolve([
                d.validator_address,
                await aggregate(d.reward, assetsData),
              ])
            )
        )
      )
    ),
    total: await aggregate(total, assetsData),
  };
};
