const getTotalSupply = require('./getTotalSupply');
const getCirculatingSupply = require('./getCirculatingSupply');
const getTotalBurned = require('./getTotalBurned');
const getTokenInfo = require('./getTokenInfo');
const searchTokenInfos = require('./searchTokenInfos');
const getInflation = require('./getInflation');
const getNetworkParameters = require('./getNetworkParameters');
const { getBalances, getDelegations, getRedelegations, getUnbondings, getRewards, getCommissions, getAccountAmounts } = require('./account');
const { getProposals, getProposal } = require('./proposal');

module.exports = {
  getTotalSupply,
  getCirculatingSupply,
  getTotalBurned,
  getTokenInfo,
  searchTokenInfos,
  getInflation,
  getNetworkParameters,
  getBalances,
  getDelegations,
  getRedelegations,
  getUnbondings,
  getRewards,
  getCommissions,
  getAccountAmounts,
  getProposals,
  getProposal,
};