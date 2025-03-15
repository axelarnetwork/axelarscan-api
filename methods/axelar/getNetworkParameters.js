const { ENVIRONMENT, getLCD } = require('../../utils/config');
const { createInstance, request } = require('../../utils/http');
const { toArray } = require('../../utils/parser');

module.exports = async params => {
  const { height } = { ...params };
  const headers = height ? { 'x-cosmos-block-height': height } : undefined;
  const instance = createInstance(getLCD(ENVIRONMENT, !!height), { gzip: true, headers });

  return Object.fromEntries(toArray(await Promise.all(
    ['stakingParams', 'bankSupply', 'stakingPool', 'slashingParams'].map(k => new Promise(async resolve => {
      switch (k) {
        case 'stakingParams':
          resolve([k, (await request(instance, { path: '/cosmos/staking/v1beta1/params' }))?.params]);
          break;
        case 'bankSupply':
          resolve([k, (await request(instance, { path: `/cosmos/bank/v1beta1/supply/${ENVIRONMENT === 'devnet-amplifier' ? 'uamplifier' : 'uaxl'}` }))?.amount]);
          break;
        case 'stakingPool':
          resolve([k, (await request(instance, { path: '/cosmos/staking/v1beta1/pool' }))?.pool]);
          break;
        case 'slashingParams':
          resolve([k, (await request(instance, { path: '/cosmos/slashing/v1beta1/params' }))?.params]);
          break;
        default:
          resolve();
          break;
      }
    }))
  )));
};