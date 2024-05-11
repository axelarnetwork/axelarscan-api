const { ZeroAddress } = require('ethers');
const _ = require('lodash');
const moment = require('moment');

const saveIBCChannels = require('./saveIBCChannels');
const { getTokensPrice, getTokenCirculatingSupply } = require('../tokens');
const { get, read, write } = require('../../services/indexer');
const { getBalance, getTokenSupply } = require('../../utils/chain/evm');
const { getCosmosBalance, getIBCSupply } = require('../../utils/chain/cosmos');
const { IBC_CHANNEL_COLLECTION, TVL_COLLECTION, getChainsList, getChainData, getAssetsList, getAssetData, getITSAssetsList, getITSAssetData, getContracts, getTVLConfig } = require('../../utils/config');
const { toHash, getAddress, split, toArray } = require('../../utils/parser');
const { isString, lastString } = require('../../utils/string');
const { isNumber, toNumber } = require('../../utils/number');
const { timeDiff } = require('../../utils/time');

const CACHE_AGE_SECONDS = 60 * 60;
const IBC_CHANNELS_UPDATE_INTERVAL_SECONDS = 240 * 60;

const normalizeCacheId = id => isString(id) ? split(id, { delimiter: '/' }).join('_') : undefined;

module.exports = async params => {
  const assetsData = toArray(await getAssetsList());
  const itsAssetsData = toArray(await getITSAssetsList());
  const { gateway_contracts } = { ...await getContracts() };
  const { asset, chain, force_update } = { ...params };
  let { assets, chains } = { ...params };
  assets = toArray(assets || asset);
  assets = assets.length === 0 ? _.concat(assetsData, itsAssetsData).map(d => d.id) : await Promise.all(assets.map(d => new Promise(async resolve => resolve((await getAssetData(d, assetsData))?.denom || (await getITSAssetData(d, itsAssetsData))?.id))));
  chains = toArray(chains || chain);
  chains = chains.length === 0 ? getChainsList().filter(d => (d.chain_type === 'cosmos' || gateway_contracts?.[d.id]?.address) && !d.no_tvl).map(d => d.id) : _.uniq(_.concat('axelarnet', toArray(chains.map(d => getChainData(d)?.id))));

  const { percent_diff_escrow_supply_threshold, percent_diff_total_supply_threshold } = { ...getTVLConfig() };
  const evmChainsData = getChainsList('evm').filter(d => chains.includes(d.id) && !d.no_tvl);
  const cosmosChainsData = getChainsList('cosmos').filter(d => chains.includes(d.id) && !d.no_tvl);
  const hasAllEVMChains = evmChainsData.length >= getChainsList('evm').filter(d => gateway_contracts?.[d.id]?.address && !d.no_tvl).length;
  const hasAllCosmosChains = cosmosChainsData.length >= getChainsList('cosmos').filter(d => !d.no_tvl).length;
  const hasAllChains = hasAllEVMChains && hasAllCosmosChains;

  // set cacheId on querying single asset on every chains
  const cacheId = assets.length === 1 && hasAllChains && normalizeCacheId(_.head(assets));
  let cache;
  if (!force_update) {
    // query cache
    if (cacheId) {
      cache = await get(TVL_COLLECTION, cacheId);
      const { updated_at } = { ...cache };
      if (timeDiff(updated_at * 1000) < CACHE_AGE_SECONDS) return cache;
    }
    else if (assets.length > 1 && hasAllChains) {
      const response = await read(TVL_COLLECTION, {
        bool: {
          should: assets.map(id => { return { match: { _id: normalizeCacheId(id) } }; }),
          minimum_should_match: 1,
        },
      }, { size: assets.length });
      const { data } = { ...response };

      if (toArray(data).length > 0) {
        return {
          ...response,
          data: _.orderBy(toArray(data).flatMap(d => {
            const { updated_at } = { ...d };
            const tvlData = _.head(d.data);
            const { total, price } = { ...tvlData };
            return { ...tvlData, value: toNumber(total) * toNumber(price), updated_at };
          }), ['value'], ['desc']),
          updated_at: _.minBy(toArray(data), 'updated_at')?.updated_at,
        };
      }
    }
  }

  const axelarnet = getChainData('axelarnet');
  const axelarnetLCDUrl = _.head(axelarnet.endpoints?.lcd);

  const data = [];
  for (const asset of assets) {
    let assetData = await getAssetData(asset, assetsData);
    let assetType = 'gateway';

    if (!assetData) {
      const itsAssetData = await getITSAssetData(asset, itsAssetsData);
      if (itsAssetData) {
        assetData = { ...itsAssetData, addresses: Object.fromEntries(Object.entries({ ...itsAssetData.chains }).map(([k, v]) => {
          const value = { symbol: v.symbol };
          if (v.tokenManager) value.token_manager_address = v.tokenManager;
          if (v.tokenManagerType) value.token_manager_type = v.tokenManagerType;

          switch (getChainData(k)?.chain_type) {
            case 'cosmos':
              value.ibc_denom = v.tokenAddress;
              break;
            default:
              value.address = v.tokenAddress;
              break;
          }
          return [k, value];
        })) };
        delete assetData.chains;
        assetType = 'its';
      }
    }

    const { native_chain, addresses, coingecko_id } = { ...assetData };
    const isNativeOnEVM = !!getChainData(native_chain, 'evm');
    const isNativeOnCosmos = !!getChainData(native_chain, 'cosmos');
    const isNativeOnAxelarnet = native_chain === 'axelarnet';
    const isCanonicalITS = assetType === 'its' && Object.values({ ...addresses }).findIndex(d => d.token_manager_type?.startsWith('lockUnlock')) > -1;

    let tvl = Object.fromEntries((await Promise.all(
      _.concat(evmChainsData, cosmosChainsData).map(d => new Promise(async resolve => {
        const { id, chain_type, endpoints, explorer, prefix_chain_ids } = { ...d };
        const { url, address_path, contract_path, asset_path } = { ...explorer };
        const gateway_address = gateway_contracts?.[id]?.address;
        const isNative = id === native_chain;

        let result;
        switch (chain_type) {
          case 'evm':
            try {
              const contract_data = { ...assetData, ...addresses?.[id], contract_address: addresses?.[id]?.address };
              delete contract_data.addresses;
              const { address, token_manager_address, token_manager_type } = { ...contract_data };

              if (address) {
                const gateway_balance = assetType !== 'its' ? toNumber(await getBalance(id, gateway_address, contract_data)) : 0;
                const isLockUnlock = assetType === 'its' && token_manager_address && token_manager_type?.startsWith('lockUnlock');
                const token_manager_balance = isLockUnlock ? toNumber(await getBalance(id, token_manager_address, contract_data)) : 0;
                const supply = !isNative || assetType === 'its' ? isLockUnlock ? token_manager_balance : toNumber(await getTokenSupply(id, contract_data)) : 0;
                result = {
                  contract_data, gateway_address, gateway_balance,
                  ...(isLockUnlock ? { token_manager_address, token_manager_type, token_manager_balance } : undefined),
                  supply, total: isNativeOnCosmos ? 0 : gateway_balance + supply,
                  url: url && `${url}${(address === ZeroAddress ? address_path : contract_path).replace('{address}', address === ZeroAddress ? gateway_address : address)}${isNative && address !== ZeroAddress ? gateway_address && assetType !== 'its' ? `?a=${gateway_address}` : isLockUnlock ? `?a=${token_manager_address}` : '' : ''}`,
                  success: isNumber(isNative && assetType !== 'its' ? gateway_balance : supply),
                };
              }
            } catch (error) {}
            break;
          case 'cosmos':
            try {
              const denom_data = { ...assetData, ...addresses?.[id], denom: addresses?.axelarnet?.ibc_denom };
              delete denom_data.addresses;
              const { denom, ibc_denom } = { ...denom_data };

              if (ibc_denom) {
                let ibc_channels;
                let escrow_addresses;
                let source_escrow_addresses;
                if (toArray(prefix_chain_ids).length > 0 && id !== 'axelarnet') {
                  for (let i = 0; i < 2; i++) {
                    const { data } = { ...await read(IBC_CHANNEL_COLLECTION, {
                      bool: {
                        must: [{ match: { state: 'STATE_OPEN' } }],
                        should: toArray(prefix_chain_ids).map(p => { return { match_phrase_prefix: { chain_id: p } }; }),
                        minimum_should_match: 1,
                      },
                    }, { size: 500 }) };

                    if (toArray(data).length > 0 && toArray(data).filter(d => timeDiff(d.updated_at * 1000) > IBC_CHANNELS_UPDATE_INTERVAL_SECONDS).length === 0) {
                      ibc_channels = data;
                      escrow_addresses = toArray(toArray(ibc_channels).map(d => d.escrow_address));
                      source_escrow_addresses = toArray(toArray(ibc_channels).map(d => d.counterparty?.escrow_address));
                      break;
                    }
                    else await saveIBCChannels();
                  }
                }

                const escrow_balance = _.sum(await Promise.all(toArray(escrow_addresses).map(address => new Promise(async resolve => resolve(toNumber(await getCosmosBalance('axelarnet', address, denom_data)))))));
                const source_escrow_balance = _.sum(await Promise.all(toArray(source_escrow_addresses).map(address => new Promise(async resolve => resolve(toNumber(await getCosmosBalance(id, address, denom_data)))))));

                const isNativeOnCosmos = isNative && id !== 'axelarnet';
                const isNotNativeOnAxelarnet = !isNative && id === 'axelarnet';
                const isSecretSnip = id === 'secret-snip';
                const LCDUrl = _.head(endpoints?.lcd);

                let supply = isNative ? id !== 'axelarnet' ? source_escrow_balance : 0 : toArray(escrow_addresses).length > 0 ? await getIBCSupply(id, denom_data) : 0;
                supply = isNumber(supply) ? toNumber(supply) : supply;
                const totalSupply = isNativeOnCosmos ? toNumber(await getIBCSupply('axelarnet', denom_data)) : 0;
                const percent_diff_supply = isNativeOnCosmos ? totalSupply > 0 && source_escrow_balance > 0 ? Math.abs(source_escrow_balance - totalSupply) * 100 / source_escrow_balance : null : supply > 0 && escrow_balance > 0 ? Math.abs(escrow_balance - supply) * 100 / escrow_balance : null;
                let total = isNotNativeOnAxelarnet ? toNumber(await getIBCSupply(id, denom_data)) : isNativeOnCosmos ? toNumber(await getIBCSupply('axelarnet', { ...denom_data, ibc_denom: denom_data.denom })) : isSecretSnip ? escrow_balance : 0;
                total = isNumber(total) ? toNumber(total) : total;

                result = {
                  denom_data, ibc_channels,
                  escrow_addresses, escrow_balance, source_escrow_addresses, source_escrow_balance,
                  supply, total, percent_diff_supply, is_abnormal_supply: percent_diff_supply > percent_diff_escrow_supply_threshold,
                  url: url && address_path && toArray(source_escrow_addresses).length > 0 && isNativeOnCosmos ?
                    `${url}${address_path.replace('{address}', _.last(source_escrow_addresses))}` :
                    !isSecretSnip && url && asset_path && ibc_denom?.includes('/') ?
                      `${url}${asset_path.replace('{ibc_denom}', Buffer.from(lastString(ibc_denom, { delimiter: '/' })).toString('base64'))}` :
                      axelarnet.explorer?.url && axelarnet.explorer.address_path && toArray(escrow_addresses).length > 0 ?
                        `${axelarnet.explorer.url}${axelarnet.explorer.address_path.replace('{address}', isSecretSnip ? _.head(escrow_addresses) : _.last(escrow_addresses))}` :
                        null,
                  escrow_addresses_urls: toArray(isNativeOnCosmos ?
                    _.reverse(_.cloneDeep(toArray(source_escrow_addresses))).flatMap(a => [
                      url && address_path && `${url}${address_path.replace('{address}', a)}`,
                      ibc_denom && `${LCDUrl}/cosmos/bank/v1beta1/balances/${a}/by_denom?denom=${encodeURIComponent(ibc_denom)}`,
                      `${LCDUrl}/cosmos/bank/v1beta1/balances/${a}`,
                    ]) :
                    _.reverse(_.cloneDeep(toArray(escrow_addresses))).flatMap(a => [
                      axelarnet.explorer?.url && axelarnet.explorer.address_path && `${axelarnet.explorer.url}${axelarnet.explorer.address_path.replace('{address}', a)}`,
                      denom && `${axelarnetLCDUrl}/cosmos/bank/v1beta1/balances/${a}/by_denom?denom=${encodeURIComponent(denom)}`,
                      `${axelarnetLCDUrl}/cosmos/bank/v1beta1/balances/${a}`,
                    ])
                  ),
                  supply_urls: toArray(!isNativeOnCosmos && toArray(escrow_addresses).length > 0 && [ibc_denom && `${LCDUrl}/cosmos/bank/v1beta1/supply/${encodeURIComponent(ibc_denom)}`, `${LCDUrl}/cosmos/bank/v1beta1/supply`]),
                  success: isNumber(isNotNativeOnAxelarnet ? total : supply) || !ibc_denom,
                };
              }
            } catch (error) {}
            break;
          default:
            break;
        }
        resolve([id, result]);
      }))
    )).filter(([k, v]) => v));

    tvl = Object.fromEntries(Object.entries(tvl).map(([k, v]) => {
      const { supply, total } = { ...v };
      return [k, { ...v, supply: getChainData(k)?.chain_type !== 'cosmos' ? supply : k === 'axelarnet' && assetType !== 'its' ? isNativeOnEVM ? total - _.sum(toArray(Object.entries(tvl).filter(([k, v]) => getChainData(k)?.chain_type === 'cosmos').map(([k, v]) => k === 'secret-snip' ? v.total : v.supply))) : isNativeOnCosmos ? total ? total - _.sum(toArray(Object.entries(tvl).filter(([k, v]) => getChainData(k)?.chain_type === 'evm').map(([k, v]) => v.supply))) : 0 : supply : supply }];
    }));

    const total_on_evm = _.sum(toArray(Object.entries(tvl).filter(([k, v]) => getChainData(k)?.chain_type === 'evm' && !v.token_manager_type?.startsWith('lockUnlock')).map(([k, v]) => v.supply)));
    const total_on_cosmos = _.sum(toArray(Object.entries(tvl).filter(([k, v]) => getChainData(k)?.chain_type === 'cosmos' && k !== native_chain).map(([k, v]) => v[hasAllCosmosChains ? isNativeOnCosmos || k === 'secret-snip' ? 'supply' : 'total' : 'escrow_balance'])));
    const total = isNativeOnCosmos || isNativeOnAxelarnet ? total_on_evm + total_on_cosmos : assetType === 'its' ? isCanonicalITS ? _.sum(toArray(Object.values(tvl).map(d => d.token_manager_balance))) : toNumber(await getTokenCirculatingSupply(coingecko_id)) : _.sum(toArray(Object.entries(tvl).map(([k, v]) => isNativeOnEVM ? v.gateway_balance : v.total)));
    const evm_escrow_address = isNativeOnCosmos ? getAddress(isNativeOnAxelarnet ? asset : `ibc/${toHash(`transfer/${_.last(tvl[native_chain]?.ibc_channels)?.channel_id}/${asset}`)}`, axelarnet.prefix_address, 32) : undefined;
    const evm_escrow_balance = evm_escrow_address ? toNumber(await getCosmosBalance('axelarnet', evm_escrow_address, { ...assetData, ...addresses?.axelarnet })) : 0;
    const evm_escrow_address_urls = evm_escrow_address && toArray([axelarnet.explorer?.url && axelarnet.explorer.address_path && `${axelarnet.explorer.url}${axelarnet.explorer.address_path.replace('{address}', evm_escrow_address)}`, `${axelarnetLCDUrl}/cosmos/bank/v1beta1/balances/${evm_escrow_address}`]);
    const percent_diff_supply = evm_escrow_address ? evm_escrow_balance > 0 && total_on_evm > 0 ? Math.abs(evm_escrow_balance - total_on_evm) * 100 / evm_escrow_balance : null : total > 0 && total_on_evm >= 0 && total_on_cosmos >= 0 && total_on_evm + total_on_cosmos > 0 ? Math.abs(total - (total_on_evm + total_on_cosmos)) * 100 / total : null;

    const pricesData = await getTokensPrice({ symbol: asset });
    const { price } = { ...(pricesData?.[asset] || pricesData?.[assetData?.symbol] || Object.values({ ...pricesData }).find(d => d.denom === asset)) };
    data.push({
      asset, assetType, price,
      tvl, total_on_evm, total_on_cosmos, total,
      evm_escrow_address, evm_escrow_balance, evm_escrow_address_urls,
      percent_diff_supply, is_abnormal_supply: percent_diff_supply > (evm_escrow_address ? percent_diff_escrow_supply_threshold : percent_diff_total_supply_threshold),
      percent_diff_escrow_supply_threshold, percent_diff_total_supply_threshold,
      success: Object.values(tvl).filter(d => !d.success).length === 0,
    });
  }

  let result = { data, updated_at: moment().unix() };
  let not_updated_on_chains;
  if (data.length === 0 && cache) result = cache;
  else if (cacheId) {
    const unsuccessData = data.filter(d => !d.success);
    // caching
    if (unsuccessData.length === 0) await write(TVL_COLLECTION, cacheId, result);
    else not_updated_on_chains = unsuccessData.flatMap(d => Object.entries(d.tvl).filter(([k, v]) => !v?.success).map(([k, v]) => k));
  }
  return { ...result, not_updated_on_chains };
};