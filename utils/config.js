const config = require('config-yml');
const { toBeHex } = require('ethers');
const _ = require('lodash');

const { readCache, writeCache } = require('./cache');
const { request } = require('./http');
const { toArray } = require('./parser');
const { capitalize, removeDoubleQuote, headString, find } = require('./string');
const { isNumber } = require('./number');

const ENVIRONMENT = process.env.ENVIRONMENT || 'testnet';

const getLogLevel = () => process.env.LOG_LEVEL || 'debug';
const getMethods = () => config.methods;

const getChains = (types, env = ENVIRONMENT) => {
  types = toArray(types).map(t => t === 'vm' ? 'amplifier' : t);

  // get chains of env and filter by chain types
  return Object.entries({ ...config.chains[env] }).filter(([k, v]) => types.length === 0 || types.includes(k)).flatMap(([k, v]) => Object.entries({ ...v }).map(([_k, _v]) => {
    let provider_params;

    switch (k) {
      case 'evm':
      case 'amplifier':
        if (isNumber(_v.chain_id)) {
          provider_params = [{
            chainId: toBeHex(_v.chain_id).replace('0x0', '0x'),
            chainName: `${_v.name} ${capitalize(env)}`,
            rpcUrls: toArray(_v.endpoints?.rpc),
            nativeCurrency: _v.native_token,
            blockExplorerUrls: toArray(_v.explorer?.url),
          }];
        }
        break;
      default:
        break;
    }

    return {
      ..._v,
      id: _k,
      chain_type: k === 'amplifier' ? 'vm' : k,
      provider_params,
      no_inflation: !!_v.deprecated,
      no_tvl: _v.no_tvl || !!_v.deprecated,
    };
  })).filter(d => !d.disabled);
};

const getChainData = (chain, types, env = ENVIRONMENT) => {
  if (!chain) return;

  return getChains(types, env).find(d =>
    find(removeDoubleQuote(chain), _.concat(d.id, d.chain_id, d.chain_name, d.maintainer_id, d.aliases)) || // check equals
    toArray(d.prefix_chain_ids).findIndex(p => chain.startsWith(p)) > -1 // check prefix
  );
};

const getChainByS3ConfigChain = chain => {
  const chainsMapping = {
    testnet: {
      terra: 'terra-3',
    },
  };

  if (chainsMapping[ENVIRONMENT]?.[chain]) {
    return chainsMapping[ENVIRONMENT][chain];
  }

  return getChainData(chain)?.id || chain;
};

const getAxelarS3Config = async (env = ENVIRONMENT, forceCache = false, cacheId = 's3configAssets') => {
  // get s3 config from cache
  if (!forceCache) {
    const cache = await readCache(cacheId, 900);
    if (cache) return cache;
  }

  const response = await request(`https://axelar-${headString(env)}.s3.us-east-2.amazonaws.com/configs/${env}-config-1.x.json`);

  if (response) {
    const chainsCacheId = 's3configChains';
    const assetsCacheId = 's3configAssets';

    let chains;

    if (response.chains) {
      chains = Object.fromEntries(Object.entries(response.chains).map(([k, v]) => [k, { config: { ibc: v.config?.ibc } }]));

      // caching chains config
      await writeCache(chainsCacheId, { chains });
    }

    // remove unused fields
    if (response.tokenAddressToAsset) delete response.tokenAddressToAsset;
    if (response.amplifier_configs) delete response.amplifier_configs;
    if (response.chains) delete response.chains;

    if (response.assets) {
      response.assets = Object.fromEntries(Object.entries(response.assets).map(([k, v]) => {
        if (v.details) delete v.details;
        return [k, v];
      }));

      // caching assets config
      await writeCache(assetsCacheId, response);
    }

    // return config
    switch (cacheId) {
      case chainsCacheId:
        if (chains) {
          return { chains };
        }
        break;
      case assetsCacheId:
        if (response.assets) {
          return response;
        }
        break;
      default:
        break;
    }
  }

  return await readCache(cacheId, 24 * 3600);
};

const getAxelarS3ChainsConfig = async (env = ENVIRONMENT, forceCache = false) => await getAxelarS3Config(env, forceCache, 's3configChains');

const getAxelarS3AssetsConfig = async (env = ENVIRONMENT, forceCache = false) => await getAxelarS3Config(env, forceCache, 's3configAssets');

const getAssets = async (env = ENVIRONMENT, cacheId = 'assets') => {
  // get assets from cache
  const cache = await readCache(cacheId, 600);
  if (cache) return cache;

  const response = await getAxelarS3AssetsConfig(env);

  // assetsData from config
  const assetsData = _.cloneDeep({ ...config.assets[env] });

  // gateway assets
  for (const d of Object.values({ ...response?.assets }).filter(d => d.type === 'gateway')) {
    const existingDenom = _.head(Object.entries({ ...config.assets[env] }).find(([k, v]) => find(d.id, _.concat(v.denom, v.denoms))));

    // denom from existing config or s3 config
    const denom = existingDenom || d.id;

    // get asset addresses from existing
    let { addresses } = { ...assetsData[denom] };

    for (const [k, v] of Object.entries({ ...d.chains })) {
      const chain = getChainByS3ConfigChain(k);

      // get asset info of each chain
      const { symbol, address, ibc_denom } = { ...addresses?.[chain] };

      // set asset info that retrieved from s3 config
      addresses = {
        ...addresses,
        [chain]: {
          symbol: d.id.endsWith('-uusdc') ? assetsData[denom]?.symbol : v.symbol || symbol,
          address: (v.tokenAddress?.startsWith('0x') ? v.tokenAddress : undefined) || address,
          ibc_denom: (v.tokenAddress === d.id || v.tokenAddress?.includes('/') ? v.tokenAddress : undefined) || ibc_denom,
        },
      };
    }

    // native chain from s3 config
    const nativeChain = getChainByS3ConfigChain(d.originAxelarChainId);

    // set asset info of native chain
    if (getChainData(nativeChain, 'cosmos') && !addresses?.[nativeChain]) {
      addresses = {
        ...addresses,
        [nativeChain]: {
          symbol: d.prettySymbol,
          ibc_denom: d.id,
        },
      };
    }

    // update assetData of this denom to assetsData map
    assetsData[denom] = {
      ...assetsData[denom],
      denom,
      native_chain: nativeChain,
      name: d.name || d.prettySymbol,
      symbol: d.id.endsWith('-uusdc') ? assetsData[denom]?.symbol : d.prettySymbol,
      decimals: d.decimals,
      image: existingDenom ? d.iconUrl?.replace('/images/tokens/', '/logos/assets/') : `${d.iconUrl?.startsWith('http') ? '' : response.resources?.staticAssetHost}${d.iconUrl}`,
      coingecko_id: d.coingeckoId,
      addresses,
    };
  }

  // filter duplicate assets
  const assetsDataEntries = Object.entries(assetsData).filter(([k, v]) => !find(k, Object.values(assetsData).flatMap(d => toArray(d.denoms))));

  // create assets list
  const data = assetsDataEntries.map(([k, v]) => ({ ...v, id: k }));

  // caching assets
  await writeCache(cacheId, data);

  return data;
};

const getAssetData = async (asset, assetsData, env = ENVIRONMENT) => {
  if (!asset) return;

  // handle get burned asset
  if (asset.startsWith('burned-')) asset = asset.replace('burned-', '');

  assetsData = toArray(assetsData || await getAssets(env));

  return assetsData.find(d =>
    find(asset, _.concat(d.denom, d.denoms, d.symbol)) || // check equals
    toArray(Object.values({ ...d.addresses })).findIndex(a => find(asset, [a.address, a.ibc_denom, a.symbol])) > -1 // check equals to address, denom or symbol of each chain
  );
};

const getITSAssets = async (env = ENVIRONMENT, cacheId = 'itsAssets') => {
  // get its assets from cache
  const cache = await readCache(cacheId, 600);
  if (cache) return cache;

  const response = await getAxelarS3AssetsConfig(env);

  // ITS assets
  const data = Object.values({ ...response?.assets }).filter(d => find(d.type, ['customInterchain', 'interchain', 'canonical'])).map(d => ({
    id: d.id,
    type: d.type,
    symbol: d.prettySymbol,
    name: d.name,
    decimals: d.decimals,
    image: `${d.iconUrl?.startsWith('http') ? '' : response.resources?.staticAssetHost}${d.iconUrl}`,
    coingecko_id: d.coingeckoId,
    addresses: _.uniq(toArray(Object.values({ ...d.chains }).map(c => c.tokenAddress))),
    native_chain: getChainByS3ConfigChain(d.originAxelarChainId),
    chains: d.chains,
  }));

  // caching its assets
  await writeCache(cacheId, data);

  return data;
};

const getITSAssetData = async (asset, assetsData, env = ENVIRONMENT) => {
  if (!asset) return;

  assetsData = toArray(assetsData || await getITSAssets(env));

  // check equals
  return assetsData.find(d => find(asset, _.concat(d.id, d.symbol, d.addresses)));
};

const getTokens = () => config.tokens;
const getSupplyConfig = (env = ENVIRONMENT) => config.supply[env];
const getTVLConfig = (env = ENVIRONMENT) => config.tvl[env];
const getCustomTVLConfig = (env = ENVIRONMENT) => config.custom_tvl[env];

const getContracts = async (env = ENVIRONMENT) => await request(`${getGMPAPI(env)}/getContracts`);

const getEndpoints = (env = ENVIRONMENT) => config.endpoints[env];
const getLCD = (archive = false, env = ENVIRONMENT) => (archive && getEndpoints(env)?.lcd_archive) || getEndpoints(env)?.lcd;
const getValidatorAPI = (env = ENVIRONMENT) => getEndpoints(env)?.validator_api;
const getTokenTransferAPI = (env = ENVIRONMENT) => getEndpoints(env)?.token_transfer_api;
const getGMPAPI = (env = ENVIRONMENT) => getEndpoints(env)?.gmp_api;
const getAppURL = (env = ENVIRONMENT) => getEndpoints(env)?.app;

module.exports = {
  ENVIRONMENT,
  TOKEN_PRICE_COLLECTION: 'token_prices',
  TOKEN_INFO_COLLECTION: 'token_infos',
  TOKEN_TVL_COLLECTION: 'token_tvls',
  IBC_CHANNEL_COLLECTION: 'ibc_channels',
  TOKEN_API: 'https://api.coingecko.com/api/v3/',
  CURRENCY: 'usd',
  getLogLevel,
  getMethods,
  getChains,
  getChainData,
  getAxelarS3Config,
  getAxelarS3ChainsConfig,
  getAxelarS3AssetsConfig,
  getAssets,
  getAssetData,
  getITSAssets,
  getITSAssetData,
  getTokens,
  getSupplyConfig,
  getTVLConfig,
  getCustomTVLConfig,
  getContracts,
  getEndpoints,
  getLCD,
  getValidatorAPI,
  getTokenTransferAPI,
  getGMPAPI,
  getAppURL,
};