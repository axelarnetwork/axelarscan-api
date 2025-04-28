const moment = require('moment');

const METHODS = require('../../methods');

module.exports = async () => {
  const minute = moment().minutes();
  // run every 10 minutes
  if (minute % 10 !== 0) return;

  await Promise.all([
    'transfersStats', 'transfersStatsByTime', 'transfersChart', 'transfersTotalVolume',
    'transfersTopUsers', 'transfersTopUsersByVolume',
    'GMPStatsByChains', 'GMPStatsByContracts', 'GMPStatsByTime', 'GMPStatsAVGTimes', 'GMPChart', 'GMPTotalVolume',// 'GMPStats',
    'GMPTopUsers', 'GMPTopITSUsers', 'GMPTopITSUsersByVolume', 'GMPTopITSAssets', 'GMPTopITSAssetsByVolume',
  ].map(d => new Promise(async resolve => {
    switch (d) {
      case 'transfersStats':
        resolve(await METHODS.transfersStats({ forceCache: true }));
        break;
      case 'transfersStatsByTime':
        resolve(await METHODS.transfersStatsByTime({ forceCache: true }));
        break;
      case 'transfersChart':
        resolve(await METHODS.transfersChart({ granularity: 'month', forceCache: true }));
        break;
      case 'transfersTotalVolume':
        resolve(await METHODS.transfersTotalVolume({ forceCache: true }));
        break;
      case 'transfersTopUsers':
        resolve(await METHODS.transfersTopUsers({ size: 100, forceCache: true }));
        break;
      case 'transfersTopUsersByVolume':
        resolve(await METHODS.transfersTopUsers({ orderBy: 'volume', size: 100, forceCache: true }));
        break;
      case 'GMPStats':
        resolve(await METHODS.GMPStats({ forceCache: true }));
        break;
      case 'GMPStatsByChains':
        resolve(await METHODS.GMPStatsByChains({ forceCache: true }));
        break;
      case 'GMPStatsByContracts':
        resolve(await METHODS.GMPStatsByContracts({ forceCache: true }));
        break;
      case 'GMPStatsByTime':
        resolve(await METHODS.GMPStatsByTime({ forceCache: true }));
        break;
      case 'GMPStatsAVGTimes':
        resolve(await METHODS.GMPStatsAVGTimes({ fromTime: moment().subtract(1, 'months').startOf('day').unix(), forceCache: true }));
        break;
      case 'GMPChart':
        resolve(await METHODS.GMPChart({ granularity: 'month', forceCache: true }));
        break;
      case 'GMPTotalVolume':
        resolve(await METHODS.GMPTotalVolume({ forceCache: true }));
        break;
      case 'GMPTopUsers':
        resolve(await METHODS.GMPTopUsers({ size: 100, forceCache: true }));
        break;
      case 'GMPTopITSUsers':
        resolve(await METHODS.GMPTopUsers({ assetType: 'its', size: 100, forceCache: true }));
        break;
      case 'GMPTopITSUsersByVolume':
        resolve(await METHODS.GMPTopUsers({ assetType: 'its', orderBy: 'volume', size: 100, forceCache: true }));
        break;
      case 'GMPTopITSAssets':
        resolve(await METHODS.GMPTopITSAssets({ size: 100, forceCache: true }));
        break;
      case 'GMPTopITSAssetsByVolume':
        resolve(await METHODS.GMPTopITSAssets({ orderBy: 'volume', size: 100, forceCache: true }));
        break;
      default:
        resolve(await METHODS[d]());
        break;
    }
  })));
};