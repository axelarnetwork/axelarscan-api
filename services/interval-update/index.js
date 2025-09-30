const updateTVL = require('./updateTVL');
const updateTokensPrice = require('./updateTokensPrice');
const updateStats = require('./updateStats');
const updateConfig = require('./updateConfig');
const updateTokenInfo = require('./updateTokenInfo');
const { ENVIRONMENT } = require('../../utils/config');
const { find } = require('../../utils/string');

module.exports = async () => {
  await Promise.all(
    ['tvl', 'tokensPrice', 'stats', 'config', 'tokenInfo'].map(
      d =>
        new Promise(async resolve => {
          switch (d) {
            case 'tvl':
              resolve(find(ENVIRONMENT, ['mainnet']) && (await updateTVL()));
              break;
            case 'tokensPrice':
              resolve(
                find(ENVIRONMENT, ['mainnet']) && (await updateTokensPrice())
              );
              break;
            case 'stats':
              resolve(
                find(ENVIRONMENT, ['mainnet', 'testnet']) &&
                  (await updateStats())
              );
              break;
            case 'config':
              resolve(
                find(ENVIRONMENT, ['mainnet', 'testnet']) &&
                  (await updateConfig())
              );
              break;
            case 'tokenInfo':
              resolve(
                find(ENVIRONMENT, ['mainnet', 'testnet', 'devnet-amplifier']) &&
                  (await updateTokenInfo())
              );
              break;
            default:
              resolve();
              break;
          }
        })
    )
  );
};
