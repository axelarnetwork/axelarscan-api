const circularImport = require('./circularImport');
const getChains = require('./getChains');
const getAssets = require('./getAssets');
const getITSAssets = require('./getITSAssets');
const getTokensPrice = require('./getTokensPrice');
const getTotalSupply = require('./getTotalSupply');
const getCirculatingSupply = require('./getCirculatingSupply');
const getTotalBurned = require('./getTotalBurned');
const getTokenInfo = require('./getTokenInfo');
const searchTokenInfos = require('./searchTokenInfos');
const getInflation = require('./getInflation');
const getNetworkParameters = require('./getNetworkParameters');
const getAccountAmounts = require('./getAccountAmounts');
const getProposals = require('./getProposals');
const getProposal = require('./getProposal');
const getTVL = require('./getTVL');
const getTVLAlert = require('./getTVLAlert');
const interchainChart = require('./interchainChart');
const interchainTotalVolume = require('./interchainTotalVolume');
const interchainStatsByTime = require('./interchainStatsByTime');

const test = async () => {
  await circularImport();
  getChains();
  await getAssets();
  await getITSAssets();
  await getTokensPrice();
  await getTotalSupply();
  await getCirculatingSupply();
  await getTotalBurned();
  await getTokenInfo();
  await searchTokenInfos();
  await getInflation();
  await getNetworkParameters();
  await getAccountAmounts();
  await getProposals();
  await getProposal();
  await getTVL();
  await getTVLAlert();
  await interchainChart();
  await interchainTotalVolume();
  await interchainStatsByTime();
};

test();