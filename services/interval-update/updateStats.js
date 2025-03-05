const moment = require('moment');

const METHODS = require('../../methods');

module.exports = async () => {
  const minute = moment().minutes();
  // run every 10 minutes
  if (minute % 10 !== 0) return;

  await Promise.all(['transfersStats', 'transfersChart', 'transfersCumulativeVolume', 'transfersTotalVolume', 'transfersTotalFee', 'transfersTotalActiveUsers', 'transfersTopUsers', 'transfersTopUsersByVolume', 'GMPStats', 'GMPStatsAVGTimes', 'GMPChart', 'GMPCumulativeVolume', 'GMPTotalVolume', 'GMPTotalFee', 'GMPTotalActiveUsers', 'GMPTopUsers', 'GMPTopITSUsers', 'GMPTopITSUsersByVolume', 'GMPTopITSAssets', 'GMPTopITSAssetsByVolume'].map(d => new Promise(async resolve => {
    switch (d) {
      case 'transfersTopUsers':
        resolve(await METHODS.transfersTopUsers({ size: 100 }));
        break;
      case 'transfersTopUsersByVolume':
        resolve(await METHODS.transfersTopUsers({ orderBy: 'volume', size: 100 }));
        break;
      case 'GMPStats':
        resolve(await METHODS.GMPStats({ forceCache: true }));
        break;
      case 'GMPStatsAVGTimes':
        resolve(await METHODS.GMPStatsAVGTimes({ fromTime: moment().subtract(3, 'months').startOf('day').unix() }));
        break;
      case 'GMPTopUsers':
        resolve(await METHODS.GMPTopUsers({ size: 100 }));
        break;
      case 'GMPTopITSUsers':
        resolve(await METHODS.GMPTopUsers({ assetType: 'its', size: 100 }));
        break;
      case 'GMPTopITSUsersByVolume':
        resolve(await METHODS.GMPTopUsers({ assetType: 'its', orderBy: 'volume', size: 100 }));
        break;
      case 'GMPTopITSAssets':
        resolve(await METHODS.GMPTopITSAssets({ size: 100 }));
        break;
      case 'GMPTopITSAssetsByVolume':
        resolve(await METHODS.GMPTopITSAssets({ orderBy: 'volume', size: 100 }));
        break;
      default:
        resolve(await METHODS[d]());
        break;
    }
  })));
};