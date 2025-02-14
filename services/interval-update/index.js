const updateTVL = require('./updateTVL');
const updateStats = require('./updateStats');
const updateConfig = require('./updateConfig');
const updateTokenInfo = require('./updateTokenInfo');
const { ENVIRONMENT } = require('../../utils/config');

module.exports = async context => {
  await Promise.all(['tvl', 'stats', 'config', 'tokenInfo'].map(d => new Promise(async resolve => {
    switch (d) {
      case 'tvl':
        resolve(['mainnet'].includes(ENVIRONMENT) && await updateTVL());
        break;
      case 'stats':
        resolve(['mainnet', 'testnet'].includes(ENVIRONMENT) && await updateStats());
        break;
      case 'config':
        resolve(['mainnet', 'testnet'].includes(ENVIRONMENT) && await updateConfig());
        break;
      case 'tokenInfo':
        resolve(['mainnet', 'testnet', 'devnet-amplifier'].includes(ENVIRONMENT) && await updateTokenInfo());
        break;
      default:
        resolve();
        break;
    }
  })));
};