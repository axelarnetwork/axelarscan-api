const _ = require('lodash');
const moment = require('moment');

const { getTVL } = require('../../methods');
const { getAssetsList, getITSAssetsList } = require('../../utils/config');
const { toArray } = require('../../utils/parser');

module.exports = async params => {
  const minute = moment().minutes();
  // run every 15 minutes
  if (minute % 15 !== 0) return;
  const data = {};
  await getTVL({ force_update: true, is_interval: true, custom_assets_only: true });
  for (const d of toArray(_.concat(await getAssetsList(), await getITSAssetsList())).filter(d => !params?.id || d.id === params.id).filter(d => params?.id || (minute % 30 === 0 ? d.id.startsWith('0x') : !d.id.startsWith('0x')))) {
    data[d.id] = await getTVL({ asset: d.id, force_update: true, is_interval: true });
  }
  return data;
};