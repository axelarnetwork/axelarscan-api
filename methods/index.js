const _ = require('lodash');

const { getTokensPrice } = require('./tokens');
const { getTVL, getTVLAlert } = require('./tvl');
const validator = require('./axelar/validator');
const { getTotalSupply, getCirculatingSupply, getTotalBurned, getTokenInfo, searchTokenInfos, getInflation, getNetworkParameters, getBalances, getDelegations, getRedelegations, getUnbondings, getRewards, getCommissions, getAccountAmounts, getProposals, getProposal } = require('./axelar');
const tokenTransfer = require('./interchain/token-transfer');
const GMP = require('./interchain/gmp');
const { interchainChart, interchainTotalVolume, interchainTotalFee, interchainTotalActiveUsers } = require('./interchain');
const { getMethods, getChains, getAssets, getITSAssets, getContracts } = require('../utils/config');

const METHODS = {
  getChains,
  getAssets,
  getITSAssets,
  getContracts,
  getTokensPrice,
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
  getTVL,
  getTVLAlert,
  interchainChart,
  interchainTotalVolume,
  interchainTotalFee,
  interchainTotalActiveUsers,
  ...validator,
  ...tokenTransfer,
  ...GMP,
};

METHODS.getMethods = async () => {
  const parseParameters = (parameters, methods) => {
    if (!parameters) return [];

    let results = [];

    for (const parameter of parameters) {
      const { inherit } = { ...parameter };

      if (inherit) {
        const inheritParameters = methods.find(d => d.id === inherit)?.parameters;

        // recursive parse inherit parameters
        results = _.concat(results, parseParameters(inheritParameters, methods));
      }
      else {
        results = _.concat(results, parameter);
      }
    }

    return results;
  };

  const parseResponse = async (fields, methods) => {
    if (!fields) return [];

    let results = [];

    for (const field of fields) {
      const { name, type, inherit, request } = { ...field };

      if (inherit) {
        let inheritFields = methods.find(d => d.id === inherit)?.response;

        if (request && METHODS[inherit]) {
          const parseEntries = entries => {
            const fields = [];

            for (const [k, v] of Object.entries({ ...entries })) {
              const { type, properties } = { ...v };

              if (type) {
                fields.push({ name: k, type: type === 'text' ? 'string' : type });
              }
              else if (properties) {
                // recursive parse entries
                fields.push({ name: k, type: 'object', attributes: parseEntries(properties) });
              }
            }
 
            return fields;
          };

          // parse response from request
          inheritFields = parseEntries(await METHODS[inherit]());

          if (name && type) {
            inheritFields = [{ name, type, attributes: inheritFields }];
          }
        }

        // recursive parsing when inherit
        results = _.concat(results, await parseResponse(inheritFields, methods));
      }
      else {
        results = _.concat(results, field);
      }
    }

    return results;
  };

  const methodsConfig = getMethods();
  const { methods } = { ...methodsConfig };

  return {
    ...methodsConfig,
    // parse methods from yml config
    methods: await Promise.all(methods.map(d => new Promise(async resolve => resolve({
      ...d,
      parameters: parseParameters(d.parameters, methods),
      response: await parseResponse(d.response, methods),
    })))),
  };
};

module.exports = METHODS;