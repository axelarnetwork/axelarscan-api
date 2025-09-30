const { getGMPAPI } = require('../../../utils/config');
const { createInstance, request } = require('../../../utils/http');

const requestAPI = async (method, params) =>
  await request(
    createInstance(`${getGMPAPI()}/${method}`, { timeout: 30000 }),
    { params }
  );

module.exports = {
  GMPStats: async params => await requestAPI('GMPStats', params),
  GMPStatsByChains: async params =>
    await requestAPI('GMPStatsByChains', params),
  GMPStatsByContracts: async params =>
    await requestAPI('GMPStatsByContracts', params),
  GMPStatsByTime: async params => await requestAPI('GMPStatsByTime', params),
  GMPStatsAVGTimes: async params =>
    await requestAPI('GMPStatsAVGTimes', params),
  GMPChart: async params => await requestAPI('GMPChart', params),
  GMPTotalVolume: async params => await requestAPI('GMPTotalVolume', params),
  GMPTopUsers: async params => await requestAPI('GMPTopUsers', params),
  GMPTopITSAssets: async params => await requestAPI('GMPTopITSAssets', params),
  searchGMP: async params => await requestAPI('searchGMP', params),
  getGMPDataMapping: async params =>
    await requestAPI('getGMPDataMapping', params),
};
