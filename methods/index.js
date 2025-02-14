const _ = require('lodash');

const { getTokensPrice } = require('./tokens');
const { getTotalSupply, getCirculatingSupply, getTotalBurned, getTokenInfo, getInflation, getNetworkParameters, getBalances, getDelegations, getRedelegations, getUnbondings, getRewards, getCommissions, getAccountAmounts, getProposals, getProposal } = require('./axelar');
const validator = require('./axelar/validator');
const { getTVL, getTVLAlert } = require('./tvl');
const GMP = require('./interchain/gmp');
const tokenTransfer = require('./interchain/token-transfer');
const { interchainChart, interchainTotalVolume, interchainTotalFee, interchainTotalActiveUsers } = require('./interchain');
const { getMethods, getChainsList, getAssetsList, getITSAssetsList, getContracts } = require('../utils/config');

const METHODS = {
  getChains: () => getChainsList(),
  getAssets: () => getAssetsList(),
  getITSAssets: () => getITSAssetsList(),
  getContracts: () => getContracts(),
  getTokensPrice,
  getTotalSupply,
  getCirculatingSupply,
  getTotalBurned,
  getTokenInfo,
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
  getTVL,
  getTVLAlert,
  interchainChart,
  interchainTotalVolume,
  interchainTotalFee,
  interchainTotalActiveUsers,
  ...GMP,
  ...tokenTransfer,
  ...validator,
};

METHODS.getMethods = async () => {
  const methodsConfig = getMethods();
  const { methods } = { ...methodsConfig };

  const parseParameters = (parameters, methods) => {
    if (!parameters) return [];
    let _parameters = [];
    for (const parameter of parameters) {
      const { inherit } = { ...parameter };
      if (inherit) {
        const inheritParameters = methods.find(d => d.id === inherit)?.parameters;
        _parameters = _.concat(_parameters, parseParameters(inheritParameters, methods));
      }
      else _parameters = _.concat(_parameters, parameter);
    }
    return _parameters;
  };

  const parseResponse = async (fields, methods) => {
    if (!fields) return [];

    let _fields = [];
    for (const field of fields) {
      const { name, type, inherit, request } = { ...field };

      if (inherit) {
        let inheritFields = methods.find(d => d.id === inherit)?.response;

        if (request && METHODS[inherit]) {
          const parseEntries = entries => {
            const fields = [];
            for (const [k, v] of Object.entries({ ...entries })) {
              const { type, properties } = { ...v };
              if (type) fields.push({ name: k, type: type === 'text' ? 'string' : type });
              else if (properties) fields.push({ name: k, type: 'object', attributes: parseEntries(properties) });
            }
            return fields;
          };
          inheritFields = parseEntries(await METHODS[inherit]());
          if (name && type) inheritFields = [{ name, type, attributes: inheritFields }];
        }
        _fields = _.concat(_fields, await parseResponse(inheritFields, methods));
      }
      else _fields = _.concat(_fields, field);
    }
    return _fields;
  };

  return { ...methodsConfig, methods: await Promise.all(methods.map(d => new Promise(async resolve => resolve({ ...d, parameters: parseParameters(d.parameters, methods), response: await parseResponse(d.response, methods) })))) };
};

module.exports = METHODS;