const { getValidatorAPI } = require('../../../utils/config');
const { createInstance, request } = require('../../../utils/http');

const requestAPI = async (method, params) =>
  await request(
    createInstance(`${getValidatorAPI()}/${method}`, { timeout: 30000 }),
    { params }
  );

module.exports = {
  rpc: async params => await requestAPI('rpc', params),
  lcd: async params => await requestAPI('lcd', params),
  searchBlocks: async params => await requestAPI('searchBlocks', params),
  searchTransactions: async params =>
    await requestAPI('searchTransactions', params),
  searchUptimes: async params => await requestAPI('searchUptimes', params),
  searchProposedBlocks: async params =>
    await requestAPI('searchProposedBlocks', params),
  searchHeartbeats: async params =>
    await requestAPI('searchHeartbeats', params),
  searchPolls: async params => await requestAPI('searchPolls', params),
  searchEVMPolls: async params => await requestAPI('searchEVMPolls', params),
  getValidators: async params => await requestAPI('getValidators', params),
  getValidatorsVotes: async params =>
    await requestAPI('getValidatorsVotes', params),
  getChainMaintainers: async params =>
    await requestAPI('getChainMaintainers', params),
};
