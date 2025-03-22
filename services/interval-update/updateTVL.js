const _ = require('lodash');
const moment = require('moment');

const { getTVL } = require('../../methods');
const { getAssets, getITSAssets } = require('../../utils/config');

module.exports = async params => {
  const minute = moment().minutes();
  // run every 15 minutes
  if (minute % 15 !== 0) return;

  // get TVL of custom assets
  await getTVL({ forceCache: true, isIntervalUpdate: true, customAssetsOnly: true });

  const assetsData = _.concat(await getAssets(), await getITSAssets())
    .filter(d => !params?.id || d.id === params.id) // filter by params.id
    .filter(d => params?.id || (minute % 30 === 0 ? d.id.startsWith('0x') : !d.id.startsWith('0x'))); // run ITS on min 0 and 30, otherwise gateway

  const data = {};
  for (const d of assetsData) {
    // get TVL of each asset
    data[d.id] = await getTVL({ asset: d.id, forceCache: true, isIntervalUpdate: true });
  }

  return data;
};