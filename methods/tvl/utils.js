const { ZeroAddress } = require('ethers');
const _ = require('lodash');

const { getChains, getChainData, getAssets, getAssetData, getITSAssets, getITSAssetData, getCustomTVLConfig } = require('../../utils/config');
const { toCase, toArray } = require('../../utils/parser');
const { equalsIgnoreCase, find } = require('../../utils/string');

const normalizeParams = params => {
  if (params) {
    params.assets = _.uniq(_.concat(toArray(params.assets), toArray(params.asset)));
    params.chains = _.uniq(_.concat(toArray(params.chains), toArray(params.chain)));

    // remove singular fields and using multiple one
    delete params.asset;
    delete params.chain;
  }

  return { ...params };
};

// add prefix 'u' or suffix '-wei' depend on decimals
const generateDenomForAsset = d => `${d.decimals === 6 ? 'u' : ''}${toCase(d.symbol, 'lower')}${d.decimals === 18 ? '-wei' : ''}`;

const isAssetsEquals = (a, b, isNativeToken = false) => {
  if (!(a && b)) return;

  // check native token by compare address with ZeroAddress
  isNativeToken = isNativeToken || !!find(ZeroAddress, [a.address, b.address]);

  // exact or native / wrapped
  return equalsIgnoreCase(a.symbol, b.symbol) || (isNativeToken && (equalsIgnoreCase(a.symbol, `W${b.symbol}`) || equalsIgnoreCase(b.symbol, `W${a.symbol}`)));
};

const getCustomContractsData = (chainData, assetData) => {
  const { custom_contracts } = { ...getCustomTVLConfig() };

  return toArray(custom_contracts).filter(c => c.address) // has contract address
    .filter(c => !chainData || equalsIgnoreCase(c.chain, chainData.id)) // filter by chain
    .filter(c => !assetData || toArray(c.assets).findIndex(a => a.address && isAssetsEquals(a, assetData)) > -1) // filter by contain asset
    .map(c => ({
      ...c,
      assets: toArray(c.assets).filter(a => a.address && (!assetData || isAssetsEquals(a, assetData))), // filter by asset
    }))
    .filter(c => toArray(c.assets).length > 0); // filter has assets
};

const getCustomContractsAssetsData = (chainData, assetData, gatewayAssetsData) => {
  const customAssetsFromContracts = getCustomContractsData(chainData, assetData).flatMap(c => toArray(c.assets)
    .filter(a => toArray(gatewayAssetsData).findIndex(d => isAssetsEquals(d, a)) < 0) // filter not gateway asset
    .map(a => ({
      key: [a.symbol, c.chain].join('_'),
      chain: c.chain,
      ...a,
    }))
  );

  return Object.values(_.groupBy(_.uniqBy(customAssetsFromContracts, 'key'), 'symbol')).map(assetsData => {
    const assetData = { ..._.head(assetsData) };
    delete assetData.address;

    // generate denom by asset data from config and use as id
    const denom = generateDenomForAsset(assetData);
  
    return {
      id: denom,
      denom,
      is_custom: true,
      type: 'gateway',
      ...assetData,
      addresses: Object.fromEntries(assetsData.map(d => [d.chain, d])),
    };
  });
};

const getCustomTokensData = (chainData, assetData) => {
  const { custom_tokens } = { ...getCustomTVLConfig() };

  return toArray(custom_tokens)
  .filter(a => !chainData || a.addresses?.[chainData.id]) // filter by chain
  .filter(a => !assetData || isAssetsEquals(a, assetData, chainData ? a.addresses[chainData.id].address === ZeroAddress : undefined)); // filter by asset
};

const getCustomTokensAssetsData = (chainData, assetData, gatewayAssetsData) => {
  const customTokens = getCustomTokensData(chainData, assetData).filter(a => gatewayAssetsData.findIndex(d => isAssetsEquals(d, a)) < 0) // filter not gateway asset

  return customTokens.map(assetData => {
    // generate denom by asset data from config and use as id
    const denom = generateDenomForAsset(assetData);

    return {
      id: denom,
      denom,
      is_custom: true,
      type: 'gateway',
      ...assetData,
    };
  });
};

const getTVLAssets = async params => {
  const { assets, customAssetsOnly } = { ...params };

  // gateway
  const gatewayAssetsData = (await getAssets()).map(d => ({ ...d, type: 'gateway' }));

  // custom contracts
  const customContractsAssetsData = getCustomContractsAssetsData(undefined, undefined, gatewayAssetsData);

  // custom tokens
  const customTokensAssetsData = getCustomTokensAssetsData(undefined, undefined, gatewayAssetsData);

  // ITS
  const itsAssetsData = customAssetsOnly ? [] :
    (await getITSAssets()).map(d => {
      d.type = 'its';

      // set addresses field like gateway asset
      d.addresses = Object.fromEntries(Object.entries({ ...d.chains }).map(([k, v]) => (
        [k, {
          symbol: v.symbol,
          token_manager_address: v.tokenManager,
          token_manager_type: v.tokenManagerType,
          [getChainType(k) === 'cosmos' ? 'ibc_denom': 'address']: v.tokenAddress,
        }]
      )));

      // remove chains object
      delete d.chains;

      return d;
    });

  const assetsData = _.concat(
    // gateway
    !customAssetsOnly ? gatewayAssetsData : [],
    // custom assets
    Object.values(_.groupBy(_.concat(customContractsAssetsData, customTokensAssetsData), 'id')).map(assetsData => ({
      ..._.head(assetsData),
      addresses: _.merge(...assetsData.map(d => d.addresses)),
    })),
    // ITS
    itsAssetsData,
  );

  // return all assets data when no filter assets
  if (toArray(assets).length === 0) return assetsData;

  // filter by assets
  return _.uniqBy(toArray(
    await Promise.all(assetsData.map(d => new Promise(async resolve => {
      let includes = false;

      for (const asset of assets) {
        if (await getAssetData(asset, d) || await getITSAssetData(asset, d)) {
          includes = true;
          break;
        }
      }

      resolve(includes ? d : undefined);
    })))
  ), 'id');
};

const getTVLChains = (params, types) => {
  const { chains } = { ...params };

  // get chains and filter 'no_tvl' and cosmos or has gateway
  const chainsData = getChains(types).filter(d => !d.no_tvl && (d.chain_type === 'cosmos' || d.gateway?.address));

  // return all chains data when no filter chains
  if (toArray(chains).length === 0) return chainsData;

  // filter by chains
  return _.uniqBy(_.concat(
    getChainData('axelarnet', 'cosmos'),
    chainsData.filter(d => {
      let includes = false;

      for (const chain of chains) {
        if (getChainData(chain, types)?.id === d.id) {
          includes = true;
          break;
        }
      }

      return includes;
    }),
  ), 'id');
};

const getContractData = (assetData, chainData) => {
  if (!(assetData && chainData)) return;

  const { addresses } = { ...assetData };
  let data;

  switch (chainData.chain_type) {
    case 'evm':
    case 'vm':
      data = {
        ...assetData,
        ...addresses?.[chainData.id],
        contract_address: addresses?.[chainData.id]?.address,
      };
      delete data.addresses;
      break;
    case 'cosmos':
      data = {
        ...assetData,
        ...addresses?.[chainData.id],
        denom: addresses?.axelarnet?.ibc_denom,
      };
      delete data.addresses;
      break;
    default:
      break;
  }

  return data;
};

const getChainType = chain => getChainData(chain)?.chain_type;

const isSecretSnipChain = chain => chain === 'secret-snip';

const isSecretChain = chain => chain === 'secret';

module.exports = {
  normalizeParams,
  generateDenomForAsset,
  isAssetsEquals,
  getCustomContractsData,
  getCustomContractsAssetsData,
  getCustomTokensData,
  getCustomTokensAssetsData,
  getTVLAssets,
  getTVLChains,
  getContractData,
  getChainType,
  isSecretSnipChain,
  isSecretChain,
};