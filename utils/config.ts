import { toBeHex } from 'ethers';
import _ from 'lodash';

import { readCache, writeCache } from './cache';
import { request } from './http';
import { isNumber } from './number';
import { toArray } from './parser';
import { capitalize, find, headString, removeDoubleQuote } from './string';

import assets from '../config/assets.json';
import chains from '../config/chains.json';
import custom_tvl from '../config/custom_tvl.json';
import endpoints from '../config/endpoints.json';
import methods from '../config/methods.json';
import supply from '../config/supply.json';
import tokens from '../config/tokens.json';
import tvl from '../config/tvl.json';

// Types
type Environment = 'mainnet' | 'testnet' | 'stagenet' | 'devnet-amplifier';
type ChainType = 'evm' | 'cosmos' | 'amplifier' | 'vm';

// Derive config types from JSON modules
type ChainsJson = typeof chains;
type AssetsJson = typeof assets;
type EndpointsJson = typeof endpoints;
type MethodsJson = typeof methods;
type SupplyJson = typeof supply;
type TokensJson = typeof tokens;
type TVLJson = typeof tvl;
type CustomTVLJson = typeof custom_tvl;

type ValueOf<T> = T[keyof T];
type ChainsAvailableEnv = keyof ChainsJson;
type ChainTypeMap = ChainsJson[ChainsAvailableEnv];
type AnyChainConfig = ValueOf<ValueOf<ChainTypeMap>>;
type AssetsAvailableEnv = keyof AssetsJson;
type EndpointsAvailableEnv = keyof EndpointsJson;
type SupplyAvailableEnv = keyof SupplyJson;
type TVLAvailableEnv = keyof TVLJson;
type CustomTVLAvailableEnv = keyof CustomTVLJson;

type ProviderParams = {
  chainId: string;
  chainName: string;
  rpcUrls: string[];
  nativeCurrency: {
    name: string;
    symbol: string;
    decimals: number;
    denom?: string;
  };
  blockExplorerUrls: string[];
};

type ProcessedChain = {
  id: string;
  chain_type: ChainType;
  provider_params?: ProviderParams[];
  no_inflation: boolean;
  no_tvl: boolean;
} & Record<string, unknown>;

interface AssetAddress {
  symbol?: string;
  address?: string;
  ibc_denom?: string;
}

interface Asset {
  denom: string;
  denoms?: string[];
  native_chain: string;
  name: string;
  symbol: string;
  decimals: number;
  image: string;
  coingecko_id?: string;
  addresses: Record<string, AssetAddress>;
}

interface ITSAsset {
  id: string;
  type: string;
  symbol: string;
  name: string;
  decimals: number;
  image: string;
  coingecko_id?: string;
  addresses: string[];
  native_chain: string;
  chains: Record<string, any>;
}

interface S3ConfigResponse {
  chains?: Record<string, any>;
  assets?: Record<string, any>;
  resources?: {
    staticAssetHost?: string;
  };
  tokenAddressToAsset?: any;
  amplifier_configs?: any;
}

interface ChainsMapping {
  [environment: string]: {
    [chain: string]: string;
  };
}

const ENVIRONMENT: Environment =
  (process.env.ENVIRONMENT as Environment) || 'testnet';

const getLogLevel = (): string => process.env.LOG_LEVEL || 'debug';
const getMethods = () => methods;

const getChains = (
  types?: ChainType | ChainType[],
  env: Environment = ENVIRONMENT
): ProcessedChain[] => {
  const processedTypes: ChainType[] = toArray(types).map(t =>
    t === 'vm' ? 'amplifier' : t
  );

  // get chains of env and filter by chain types
  return Object.entries(chains[env] || {})
    .filter(
      ([k]) =>
        processedTypes.length === 0 || processedTypes.includes(k as ChainType)
    )
    .flatMap(([k, v]) =>
      Object.entries(v || {}).map(([_k, _v]) => {
        const chainConfig = _v as AnyChainConfig;
        let provider_params: ProviderParams[] | undefined;

        switch (k) {
          case 'evm':
          case 'amplifier':
            if (isNumber((chainConfig as any).chain_id)) {
              provider_params = [
                {
                  chainId: toBeHex((chainConfig as any).chain_id).replace(
                    '0x0',
                    '0x'
                  ),
                  chainName: `${(chainConfig as any).name} ${capitalize(env)}`,
                  rpcUrls: toArray((chainConfig as any).endpoints?.rpc),
                  nativeCurrency: (chainConfig as any).native_token,
                  blockExplorerUrls: toArray(
                    (chainConfig as any).explorer?.url
                  ),
                },
              ];
            }
            break;
          default:
            break;
        }

        return {
          ...(chainConfig as Record<string, unknown>),
          id: _k,
          chain_type: k === 'amplifier' ? 'vm' : k,
          provider_params,
          no_inflation: !!(chainConfig as any).deprecated,
          no_tvl:
            (chainConfig as any).no_tvl || !!(chainConfig as any).deprecated,
        } as ProcessedChain;
      })
    )
    .filter(d => !d.disabled);
};

const getChainData = (
  chain: string,
  types: ChainType | ChainType[],
  env: Environment = ENVIRONMENT
): ProcessedChain | undefined => {
  if (!chain) return;

  return getChains(types, env).find(
    d =>
      find(
        removeDoubleQuote(chain),
        _.concat(d.id, d.chain_id, d.chain_name, d.maintainer_id, d.aliases)
      ) || // check equals
      toArray(d.prefix_chain_ids).findIndex(p => chain.startsWith(p)) > -1 // check prefix
  );
};

const getChainByS3ConfigChain = (chain: string): string => {
  const chainsMapping: ChainsMapping = {
    testnet: {
      terra: 'terra-3',
    },
  };

  if (chainsMapping[ENVIRONMENT]?.[chain]) {
    return chainsMapping[ENVIRONMENT][chain];
  }

  return getChainData(chain, ['evm', 'cosmos', 'amplifier'])?.id || chain;
};

const getAxelarS3Config = async (
  env: Environment = ENVIRONMENT,
  forceCache: boolean = false,
  cacheId: string = 's3configAssets'
): Promise<S3ConfigResponse | undefined> => {
  // get s3 config from cache
  if (!forceCache) {
    const cache = await readCache(cacheId, 900);
    if (cache) return cache;
  }

  const response: S3ConfigResponse = await request(
    `https://axelar-${headString(env)}.s3.us-east-2.amazonaws.com/configs/${env}-config-1.x.json`
  );

  if (response) {
    const chainsCacheId = 's3configChains';
    const assetsCacheId = 's3configAssets';

    let chains: Record<string, unknown> | undefined;

    if (response.chains) {
      chains = Object.fromEntries(
        Object.entries(response.chains).map(([k, v]) => [
          k,
          { config: { ibc: v.config?.ibc } },
        ])
      );

      // caching chains config
      await writeCache(chainsCacheId, { chains });
    }

    // remove unused fields
    if (response.tokenAddressToAsset) delete response.tokenAddressToAsset;
    if (response.amplifier_configs) delete response.amplifier_configs;
    if (response.chains) delete response.chains;

    if (response.assets) {
      response.assets = Object.fromEntries(
        Object.entries(response.assets).map(([k, v]) => {
          if (v.details) delete v.details;
          return [k, v];
        })
      );

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

const getAxelarS3ChainsConfig = async (
  env: Environment = ENVIRONMENT,
  forceCache: boolean = false
): Promise<S3ConfigResponse | undefined> =>
  await getAxelarS3Config(env, forceCache, 's3configChains');

const getAxelarS3AssetsConfig = async (
  env: Environment = ENVIRONMENT,
  forceCache: boolean = false
): Promise<S3ConfigResponse | undefined> =>
  await getAxelarS3Config(env, forceCache, 's3configAssets');

const getAssets = async (
  env: Environment = ENVIRONMENT,
  cacheId: string = 'assets'
): Promise<Asset[]> => {
  // get assets from cache
  const cache = await readCache(cacheId, 600);
  if (cache) return cache;

  const response = await getAxelarS3AssetsConfig(env);

  // assetsData from config
  const assetsData: Record<string, any> = _.cloneDeep({
    ...(assets[env] || {}),
  });

  // gateway assets
  for (const d of Object.values({ ...(response?.assets || {}) }).filter(
    d => d.type === 'gateway'
  )) {
    const existingDenom = _.head(
      Object.entries({
        ...assets[env],
      }).find(([k, v]) => {
        const asset = v as { denom?: string; denoms?: string[] };
        return find(d.id, _.concat(asset.denom, asset.denoms));
      })
    );

    // denom from existing config or s3 config
    const denom = existingDenom || d.id;

    // get asset addresses from existing
    let addresses: Record<string, AssetAddress> = {
      ...assetsData[denom]?.addresses,
    };

    for (const [k, v] of Object.entries({ ...d.chains })) {
      const chain = getChainByS3ConfigChain(k);
      const chainData = v as { tokenAddress?: string; symbol?: string };

      // get asset info of each chain
      const { symbol, address, ibc_denom } = {
        ...addresses?.[chain],
      };

      // set asset info that retrieved from s3 config
      addresses = {
        ...addresses,
        [chain]: {
          symbol: d.id.endsWith('-uusdc')
            ? assetsData[denom]?.symbol
            : chainData.symbol || symbol,
          address:
            (chainData.tokenAddress?.startsWith('0x')
              ? chainData.tokenAddress
              : undefined) || address,
          ibc_denom:
            (chainData.tokenAddress === d.id ||
            chainData.tokenAddress?.includes('/')
              ? chainData.tokenAddress
              : undefined) || ibc_denom,
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
      symbol: d.id.endsWith('-uusdc')
        ? assetsData[denom]?.symbol
        : d.prettySymbol,
      decimals: d.decimals,
      image: existingDenom
        ? d.iconUrl?.replace('/images/tokens/', '/logos/assets/')
        : `${d.iconUrl?.startsWith('http') ? '' : response.resources?.staticAssetHost}${d.iconUrl}`,
      coingecko_id: d.coingeckoId,
      addresses,
    };
  }

  // filter duplicate assets
  const assetsDataEntries = Object.entries(assetsData).filter(
    ([k, v]) =>
      !find(
        k,
        Object.values(assetsData).flatMap(d => toArray(d.denoms))
      )
  );

  // create assets list
  const data: Asset[] = assetsDataEntries.map(([k, v]) => ({
    ...v,
    id: k,
  }));

  // caching assets
  await writeCache(cacheId, data);

  return data;
};

const getAssetData = async (
  asset: string,
  assetsData?: Asset[],
  env: Environment = ENVIRONMENT
): Promise<Asset | undefined> => {
  if (!asset) return;

  // handle get burned asset
  if (asset.startsWith('burned-')) asset = asset.replace('burned-', '');

  assetsData = toArray(assetsData || (await getAssets(env)));

  return assetsData.find(
    d =>
      find(asset, _.concat(d.denom, d.denoms, d.symbol)) || // check equals
      toArray(Object.values({ ...d.addresses })).findIndex(a =>
        find(asset, [a.address, a.ibc_denom, a.symbol])
      ) > -1 // check equals to address, denom or symbol of each chain
  );
};

const getITSAssets = async (
  env: Environment = ENVIRONMENT,
  cacheId: string = 'itsAssets'
): Promise<ITSAsset[]> => {
  // get its assets from cache
  const cache = await readCache(cacheId, 600);
  if (cache) return cache;

  const response = await getAxelarS3AssetsConfig(env);

  // ITS assets
  const data: ITSAsset[] = Object.values({ ...(response?.assets || {}) })
    .filter(d => find(d.type, ['customInterchain', 'interchain', 'canonical']))
    .map(d => ({
      id: d.id,
      type: d.type,
      symbol: d.prettySymbol,
      name: d.name,
      decimals: d.decimals,
      image: `${d.iconUrl?.startsWith('http') ? '' : response.resources?.staticAssetHost}${d.iconUrl}`,
      coingecko_id: d.coingeckoId,
      addresses: _.uniq(
        toArray(
          Object.values({ ...d.chains }).map(
            (c: { tokenAddress?: string }) => c.tokenAddress
          )
        )
      ),
      native_chain: getChainByS3ConfigChain(d.originAxelarChainId),
      chains: d.chains,
    }));

  // caching its assets
  await writeCache(cacheId, data);

  return data;
};

const getITSAssetData = async (
  asset: string,
  assetsData?: ITSAsset[],
  env: Environment = ENVIRONMENT
): Promise<ITSAsset | undefined> => {
  if (!asset) return;

  assetsData = toArray(assetsData || (await getITSAssets(env)));

  // check equals
  return assetsData.find(d =>
    find(asset, _.concat(d.id, d.symbol, d.addresses))
  );
};

const getTokens = () => tokens;
const getSupplyConfig = (env: Environment = ENVIRONMENT) => supply[env];
const getTVLConfig = (env: Environment = ENVIRONMENT) => tvl[env];
const getCustomTVLConfig = (env: Environment = ENVIRONMENT) => custom_tvl[env];

const getContracts = async (env: Environment = ENVIRONMENT): Promise<unknown> =>
  await request(`${getGMPAPI(env)}/getContracts`);

const getEndpoints = (env: Environment = ENVIRONMENT) => endpoints[env];
const getLCD = (
  archive: boolean = false,
  env: Environment = ENVIRONMENT
): string | undefined =>
  (archive && getEndpoints(env)?.lcd_archive) || getEndpoints(env)?.lcd;
const getValidatorAPI = (env: Environment = ENVIRONMENT): string | undefined =>
  getEndpoints(env)?.validator_api;
const getTokenTransferAPI = (
  env: Environment = ENVIRONMENT
): string | undefined => getEndpoints(env)?.token_transfer_api;
const getGMPAPI = (env: Environment = ENVIRONMENT): string | undefined =>
  getEndpoints(env)?.gmp_api;
const getAppURL = (env: Environment = ENVIRONMENT): string | undefined =>
  getEndpoints(env)?.app;

export {
  ENVIRONMENT,
  getAppURL,
  getAssetData,
  getAssets,
  getAxelarS3AssetsConfig,
  getAxelarS3ChainsConfig,
  getAxelarS3Config,
  getChainData,
  getChains,
  getContracts,
  getCustomTVLConfig,
  getEndpoints,
  getGMPAPI,
  getITSAssetData,
  getITSAssets,
  getLCD,
  getLogLevel,
  getMethods,
  getSupplyConfig,
  getTokens,
  getTokenTransferAPI,
  getTVLConfig,
  getValidatorAPI,
};

export const TOKEN_PRICE_COLLECTION = 'token_prices';
export const TOKEN_INFO_COLLECTION = 'token_infos';
export const TOKEN_TVL_COLLECTION = 'token_tvls';
export const IBC_CHANNEL_COLLECTION = 'ibc_channels';
export const TOKEN_API = 'https://api.coingecko.com/api/v3/';
export const CURRENCY = 'usd';
