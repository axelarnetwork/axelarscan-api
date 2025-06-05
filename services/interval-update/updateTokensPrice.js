const { getTokensPrice } = require('../../methods');
const { getAssets, getITSAssets } = require('../../utils/config');

module.exports = async () => {
  // get gateway tokens price
  await getTokensPrice({ symbols: (await getAssets()).map(d => d.id), forceCache: true });

  // get its tokens price
  await getTokensPrice({ symbols: (await getITSAssets()).map(d => d.symbol), forceCache: true });
};