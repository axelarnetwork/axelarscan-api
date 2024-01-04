const getChains = require('./getChains');
const getAssets = require('./getAssets');
const getContracts = require('./getContracts');
const getTokensPrice = require('./getTokensPrice');
const getTotalSupply = require('./getTotalSupply');
const getCirculatingSupply = require('./getCirculatingSupply');
const getTokenInfo = require('./getTokenInfo');
const getInflation = require('./getInflation');
const getAccountAmounts = require('./getAccountAmounts');
const getProposals = require('./getProposals');
const getProposal = require('./getProposal');
const getTVL = require('./getTVL');
const getTVLAlert = require('./getTVLAlert');
const interchainChart = require('./interchainChart');
const interchainTotalVolume = require('./interchainTotalVolume');
const interchainTotalFee = require('./interchainTotalFee');
const interchainTotalActiveUsers = require('./interchainTotalActiveUsers');

const test = async () => {
  getChains();
  await getAssets();
  await getContracts();
  await getTokensPrice();
  await getTotalSupply();
  await getCirculatingSupply();
  await getTokenInfo();
  await getInflation();
  await getAccountAmounts();
  await getProposals();
  await getProposal();
  await getTVL();
  await getTVLAlert();
  await interchainChart();
  await interchainTotalVolume();
  await interchainTotalFee();
  await interchainTotalActiveUsers();
};

test();