const { ZeroAddress } = require('ethers');
const _ = require('lodash');
const moment = require('moment');

const saveIBCChannels = require('./saveIBCChannels');
const { normalizeParams, isAssetsEquals, getTVLAssets, getTVLChains, getChainType, getContractData } = require('./utils');
const { getTokensPrice, getTokenCirculatingSupply } = require('../tokens');
const { read } = require('../../services/indexer');
const { getBalance, getTokenSupply } = require('../../utils/chain/evm');
const { getCosmosBalance, getIBCSupply } = require('../../utils/chain/cosmos');
const { TOKEN_TVL_COLLECTION, IBC_CHANNEL_COLLECTION, getChainData, getAxelarS3Config, getContracts, getTVLConfig, getCustomTVLConfig } = require('../../utils/config');
const { readCache, writeCache, normalizeCacheId } = require('../../utils/cache');
const { toHash, getBech32Address, toArray } = require('../../utils/parser');
const { sleep } = require('../../utils/operator');
const { lastString } = require('../../utils/string');
const { isNumber, toNumber } = require('../../utils/number');
const { timeDiff } = require('../../utils/time');

const CACHE_AGE = 3600;
const IBC_CHANNELS_UPDATE_INTERVAL = 720 * 60;

const { percent_diff_escrow_supply_threshold, percent_diff_total_supply_threshold } = { ...getTVLConfig() };
const { custom_contracts, custom_tokens } = { ...getCustomTVLConfig() };

module.exports = async params => {
  params = normalizeParams(params);
  const { forceCache, isIntervalUpdate } = { ...params };

  // get contracts
  const { gateway_contracts } = { ...await getContracts() };

  // get assets
  const assetsData = await getTVLAssets(params);
  const gatewayAssetsData = assetsData.filter(d => d.type === 'gateway');
  const itsAssetsData = assetsData.filter(d => d.type === 'its');

  // get chains
  const chainsData = getTVLChains(params, ['evm', 'cosmos'], gateway_contracts);
  const evmChainsData = chainsData.filter(d => d.chain_type === 'evm');
  const cosmosChainsData = chainsData.filter(d => d.chain_type === 'cosmos');
  const isAllChains = chainsData.length >= getTVLChains(undefined, ['evm', 'cosmos'], gateway_contracts).length;
  const isAllCosmosChains = cosmosChainsData.length >= getTVLChains(undefined, ['cosmos']).length;

  // get axelar
  const axelar = getChainData('axelarnet');
  const axelarLCD = _.head(axelar.endpoints?.lcd);

  // set cacheId on querying single asset on every chains
  const cacheId = assetsData.length === 1 && isAllChains && normalizeCacheId(assetsData[0].id);

  if (!forceCache) {
    // get tvl from cache
    const cache = await readCache(cacheId, CACHE_AGE, TOKEN_TVL_COLLECTION);
    if (cache) return cache;
  }

  let cachesData;
  // use cache when no forceCache and get multiple assets or isIntervalUpdate
  if (!forceCache ? assetsData.length > 1 && isAllChains : isIntervalUpdate) {
    // get tvl of assets from cache
    const { data } = { ...await read(TOKEN_TVL_COLLECTION, {
      bool: {
        must: [{ range: { updated_at: { gte: moment().subtract(CACHE_AGE, 'seconds').valueOf() } } }],
        should: assetsData.map(d => ({ match: { _id: normalizeCacheId(d.id) } })),
        minimum_should_match: 1,
      },
    }, { size: assetsData.length }) };

    if (toArray(data).length > 0) {
      cachesData = {
        data: _.orderBy(data.flatMap(d => d.data), ['value'], ['desc']),
        updated_at: _.minBy(data, 'updated_at')?.updated_at,
      };

      if (!isIntervalUpdate) {
        return cachesData;
      }
    }
  }

  // get s3 config
  const axelars3Config = await getAxelarS3Config();

  const data = [];

  // calculate tvl of each assets
  for (const assetData of assetsData) {
    const { id: asset, type, symbol, is_custom, coingecko_id, native_chain, addresses } = { ...assetData };

    // use cache data when it's available
    const cacheData = toArray(cachesData).find(d => d.asset === asset);

    if (cacheData) {
      data.push(cacheData);
      continue;
    }

    // flags
    const isNativeOnEVM = !!getChainData(native_chain, 'evm');
    const isNativeOnCosmos = !!getChainData(native_chain, 'cosmos');
    const isNativeOnAxelar = native_chain === axelar.id;
    const isCanonicalITS = type === 'its' && Object.values({ ...addresses }).findIndex(d => d.token_manager_type?.startsWith('lockUnlock')) > -1;

    let tvlsByChain = Object.fromEntries((await Promise.all(
      chainsData.map(d => new Promise(async resolve => {
        const { id: chain, chain_type, endpoints, explorer, prefix_chain_ids } = { ...d };
        const { url, address_path, contract_path, asset_path } = { ...explorer };

        // is processing on native chain
        const isNative = native_chain && chain === native_chain;

        let tvlData;

        switch (chain_type) {
          case 'evm':
            try {
              // gateway of this chain
              const gatewayAddress = gateway_contracts?.[chain]?.address;

              // create contract data from asset and chain data
              const contractData = getContractData(assetData, d);
              const { address, token_manager_address, token_manager_type } = { ...contractData };

              if (address) {
                // get balance of this asset on gateway
                const gatewayBalance = type === 'gateway' ? toNumber(await getBalance(chain, gatewayAddress, contractData)) : 0;

                // check token manager type is lockUnlock
                const isLockUnlock = type === 'its' && token_manager_address && token_manager_type?.startsWith('lockUnlock');
                // get balance of this asset on token manager
                const tokenManagerBalance = isLockUnlock ? toNumber(await getBalance(chain, token_manager_address, contractData)) : 0;

                // for lockUnlock, supply = tokenManagerBalance, otherwise supply = getTokenSupply
                const supply = !isNative || type === 'its' ? isLockUnlock ? tokenManagerBalance : toNumber(await getTokenSupply(chain, contractData)) : 0;

                const customContractsBalances = await Promise.all(
                  toArray(custom_contracts).filter(c =>
                    c.chain === chain &&
                    c.address &&
                    toArray(c.assets).findIndex(a => isAssetsEquals(a, assetData) && a.address) > -1
                  )
                  .map(c => new Promise(async resolve => resolve({
                    address: c.address,
                    balance: toNumber(await getBalance(chain, c.address, { ...c.assets.find(a => isAssetsEquals(a, assetData)), contract_address: c.assets.find(a => isAssetsEquals(a, assetData))?.address })),
                    url: `${url}${(c.assets.find(a => isAssetsEquals(a, assetData))?.address === ZeroAddress ? address_path : contract_path).replace('{address}', c.assets.find(a => isAssetsEquals(a, assetData))?.address === ZeroAddress ? c.address : `${c.assets.find(a => isAssetsEquals(a, assetData))?.address}?a=${c.address}`)}`,
                  })))
                );

                const customTokensSupply = await Promise.all(
                  toArray(custom_tokens).filter(c =>
                    c.addresses?.[chain] &&
                    isAssetsEquals(c, assetData, c.addresses[chain].address === ZeroAddress)
                  )
                  .map(c => new Promise(async resolve => resolve({
                    address: c.addresses[chain],
                    supply: toNumber(await getTokenSupply(chain, { ...c, address: c.addresses[chain] })),
                    url: `${url}${(c.addresses[chain] === ZeroAddress ? address_path : contract_path).replace('{address}', c.addresses[chain])}`,
                  })))
                );

                tvlData = {
                  // contract
                  contract_data: contractData,
                  // gateway
                  gateway_address: gatewayAddress,
                  gateway_balance: gatewayBalance,
                  // token manager
                  ...(isLockUnlock ? {
                    token_manager_address,
                    token_manager_type,
                    token_manager_balance: tokenManagerBalance,
                  } : undefined),
                  // amount
                  supply,
                  total: isNativeOnCosmos ? 0 : gatewayBalance + supply,
                  // custom contracts
                  custom_contracts_balance: customContractsBalances,
                  total_balance_on_custom_contracts: _.sumBy(customContractsBalances, 'balance'),
                  // custom tokens
                  custom_tokens_supply: customTokensSupply,
                  total_supply_of_custom_tokens: _.sumBy(customTokensSupply, 'supply'),
                  // link
                  url: `${url}${(address === ZeroAddress ? address_path : contract_path).replace('{address}', address === ZeroAddress ? gatewayAddress : address)}${isNative && address !== ZeroAddress ? gatewayAddress && type === 'gateway' ? `?a=${gatewayAddress}` : isLockUnlock ? `?a=${token_manager_address}` : '' : ''}`,
                  // status
                  success: isNumber(isNative && type === 'gateway' ? gatewayBalance : supply),
                };
              }
            } catch (error) {}
            break;
          case 'cosmos':
            try {
              // create contract data from asset and chain data
              const contractData = getContractData(assetData, d);
              const { denom, ibc_denom } = { ...contractData };

              if (ibc_denom) {
                let ibc_channels;
                let escrow_addresses;
                let source_escrow_addresses;

                if (toArray(prefix_chain_ids).length > 0 && chain !== axelar.id) {
                  for (let i = 0; i < 1; i++) {
                    const { data } = { ...await read(IBC_CHANNEL_COLLECTION, {
                      bool: {
                        must: [{ match: { state: 'STATE_OPEN' } }],
                        should: toArray(prefix_chain_ids).map(p => ({ match_phrase_prefix: { chain_id: p } })),
                        minimum_should_match: 1,
                      },
                    }, { size: 500, sort: [{ updated_at: 'asc' }] }) };

                    if (toArray(data).length > 0 && toArray(data).filter(d => timeDiff(d.updated_at * 1000) > IBC_CHANNELS_UPDATE_INTERVAL).length === 0) {
                      const { channelId } = { ...axelars3Config?.chains?.[chain]?.config?.ibc?.fromAxelar };
                      ibc_channels = _.orderBy(data.filter(d => (!channelId && chain !== 'secret') || d.channel_id === channelId), ['latest_height'], ['asc']);
                      escrow_addresses = toArray(toArray(ibc_channels).map(d => d.escrow_address));
                      source_escrow_addresses = toArray(toArray(ibc_channels).map(d => d.counterparty?.escrow_address));
                      break;
                    }
                    else if (data) await saveIBCChannels();
                    await sleep(3000);
                  }
                }

                // get asset balance of escrow addresses on axelar
                const escrowBalance = chain === 'secret' ? undefined : _.sum(await Promise.all(toArray(escrow_addresses)
                  .map(a => new Promise(async resolve =>
                    resolve(toNumber(await getCosmosBalance(axelar.id, a, contractData)))
                  ))
                ));

                // get asset balance of source escrow addresses on cosmos chain
                const sourceEscrowBalance = _.sum(await Promise.all(toArray(source_escrow_addresses)
                  .map(a => new Promise(async resolve =>
                    resolve(toNumber(await getCosmosBalance(chain, a, contractData)))
                  ))
                ));

                // flags
                const isNativeOnCosmos = isNative && chain !== axelar.id;
                const isNotNativeOnAxelar = !isNative && chain === axelar.id;
                const isSecretSnip = chain === 'secret-snip';
                const LCDUrl = _.head(endpoints?.lcd);

                let supply = isNative ? chain !== axelar.id ? sourceEscrowBalance : 0 : toArray(escrow_addresses).length > 0 ? await getIBCSupply(chain, contractData) : 0;
                supply = isNumber(supply) ? toNumber(supply) : supply;

                const totalSupply = isNativeOnCosmos ? toNumber(await getIBCSupply(axelar.id, contractData)) : 0;
                const percentDiffSupply = isNativeOnCosmos ? totalSupply > 0 && sourceEscrowBalance > 0 ? Math.abs(sourceEscrowBalance - totalSupply) * 100 / sourceEscrowBalance : null : supply > 0 && escrowBalance > 0 ? Math.abs(escrowBalance - supply) * 100 / escrowBalance : null;

                let total = isNotNativeOnAxelar ? await getIBCSupply(chain, contractData) : isNativeOnCosmos ? await getIBCSupply(axelar.id, { ...contractData, ibc_denom: contractData.denom }) : isSecretSnip ? escrowBalance : 0;
                total = isNumber(total) ? toNumber(total) : total;

                tvlData = {
                  // contract
                  denom_data: contractData,
                  ibc_channels,
                  // escrow
                  escrow_addresses,
                  escrow_balance: escrowBalance,
                  source_escrow_addresses,
                  source_escrow_balance: sourceEscrowBalance,
                  // amount
                  supply,
                  total,
                  percent_diff_supply: percentDiffSupply,
                  is_abnormal_supply: percentDiffSupply > percent_diff_escrow_supply_threshold,
                  // link
                  url: address_path && toArray(source_escrow_addresses).length > 0 && isNativeOnCosmos ?
                    `${url}${address_path.replace('{address}', _.last(source_escrow_addresses))}` :
                    !isSecretSnip && url && asset_path && ibc_denom?.includes('/') ?
                      `${url}${asset_path.replace('{ibc_denom}', Buffer.from(lastString(ibc_denom, { delimiter: '/' })).toString('base64'))}` :
                      axelar.explorer?.url && axelar.explorer.address_path && toArray(escrow_addresses).length > 0 ?
                        `${axelar.explorer.url}${axelar.explorer.address_path.replace('{address}', isSecretSnip ? _.head(escrow_addresses) : _.last(escrow_addresses))}` :
                        null,
                  escrow_addresses_urls: toArray(isNativeOnCosmos ?
                    _.reverse(_.cloneDeep(toArray(source_escrow_addresses))).flatMap(a => [
                      address_path && `${url}${address_path.replace('{address}', a)}`,
                      ibc_denom && `${LCDUrl}/cosmos/bank/v1beta1/balances/${a}/by_denom?denom=${encodeURIComponent(ibc_denom)}`,
                      `${LCDUrl}/cosmos/bank/v1beta1/balances/${a}`,
                    ]) :
                    _.reverse(_.cloneDeep(toArray(escrow_addresses))).flatMap(a => [
                      axelar.explorer?.url && axelar.explorer.address_path && `${axelar.explorer.url}${axelar.explorer.address_path.replace('{address}', a)}`,
                      denom && `${axelarLCD}/cosmos/bank/v1beta1/balances/${a}/by_denom?denom=${encodeURIComponent(denom)}`,
                      `${axelarLCD}/cosmos/bank/v1beta1/balances/${a}`,
                    ])
                  ),
                  supply_urls: toArray(!isNativeOnCosmos && toArray(escrow_addresses).length > 0 && [ibc_denom && `${LCDUrl}/cosmos/bank/v1beta1/supply/${encodeURIComponent(ibc_denom)}`, `${LCDUrl}/cosmos/bank/v1beta1/supply`]),
                  // status
                  success: isNumber(isNotNativeOnAxelar ? total : supply) || !ibc_denom || d.unstable,
                };
              }
            } catch (error) {}
            break;
          default:
            break;
        }

        resolve([chain, tvlData]);
      }))
    )).filter(([k, v]) => v));

    // set supply on axelar chain
    if (type === 'gateway' && !isNativeOnAxelar) {
      tvlsByChain = Object.fromEntries(Object.entries(tvlsByChain).map(([k, v]) => {
        if (k === axelar.id) {
          if (!v.total) {
            v.supply = 0;
          }
          else {
            // supply on axelar = total - sum(supply of others cosmos | evm)
            v.supply = v.total - _.sum(Object.entries(tvlsByChain)
              .filter(([k, v]) => getChainType(k) === (isNativeOnEVM ? 'cosmos' : isNativeOnCosmos ? 'evm' : '')) // filter by chain type
              .map(([k, v]) => toNumber(k === 'secret-snip' ? v.total : v.supply))
            );
          }
        }
        return [k, v];
      }));
    }

    let totalOnEVM = !(type === 'gateway' || isCanonicalITS) ? 0 : _.sum(Object.entries(tvlsByChain)
      .filter(([k, v]) => getChainType(k) === 'evm' && !v.token_manager_type?.startsWith('lockUnlock'))
      .map(([k, v]) => toNumber(v.supply))
    );

    const totalOnCosmos = !(type === 'gateway' || isCanonicalITS) ? 0 : _.sum(Object.entries(tvlsByChain)
      .filter(([k, v]) => getChainType(k) === 'cosmos' && k !== native_chain)
      .map(([k, v]) => toNumber(isAllCosmosChains ? isNativeOnCosmos || k === 'secret-snip' ? v.supply : v.total : v.escrow_balance))
    );

    const totalOnContracts = !(type === 'gateway') ? 0 : _.sum(Object.entries(tvlsByChain)
      .filter(([k, v]) => getChainType(k) === 'evm')
      .map(([k, v]) => v.total_balance_on_custom_contracts)
    );

    const totalOnTokens = !(type === 'gateway') ? 0 : _.sum(Object.entries(tvlsByChain)
      .filter(([k, v]) => getChainType(k) === 'evm')
      .map(([k, v]) => v.total_supply_of_custom_tokens)
    );

    const total = totalOnContracts + totalOnTokens + (
      isNativeOnCosmos || isNativeOnAxelar ? totalOnEVM + totalOnCosmos :
      type === 'its' ?
        isCanonicalITS ?
          _.sum(Object.values(tvlsByChain).map(v => toNumber(d.token_manager_balance))) : // lockUnlock token manager balances
          toNumber(await getTokenCirculatingSupply(coingecko_id)) : // circulating supply from coingecko
        _.sum(Object.values(tvlsByChain).map(v => toNumber(isNativeOnEVM ? v.gateway_balance : v.total))) // gateway balances for native on evm, otherwise total
    );

    // total on evm += total when asset is ITS which isn't lockUnlock
    if (type === 'its' && !isCanonicalITS && isNativeOnEVM) totalOnEVM += total;

    // generate evm escrow address when native on cosmos
    const evmEscrowAddress = isNativeOnCosmos ? getBech32Address(isNativeOnAxelar ? asset : `ibc/${toHash(`transfer/${_.last(tvlsByChain[native_chain]?.ibc_channels)?.channel_id}/${asset}`)}`, axelar.prefix_address, 32) : undefined;

    // get axelar asset balance of evm escrow address
    const evmEscrowBalance = evmEscrowAddress ? toNumber(await getCosmosBalance(axelar.id, evmEscrowAddress, getContractData(assetData, axelar))) : 0;

    // debug urls of evm escrow address
    const evmEscrowURLs = !evmEscrowAddress ? undefined : toArray([
      axelar.explorer && `${axelar.explorer.url}${axelar.explorer.address_path.replace('{address}', evmEscrowAddress)}`,
      `${axelarLCD}/cosmos/bank/v1beta1/balances/${evmEscrowAddress}`,
    ]);

    const percentDiffSupply = evmEscrowAddress ?
      // compare evm escrow balance with total on evm
      evmEscrowBalance > 0 && totalOnEVM > 0 ? Math.abs(evmEscrowBalance - totalOnEVM) * 100 / evmEscrowBalance : null :
      // compare total with total on evm + total on cosmos
      total > 0 && totalOnEVM + totalOnCosmos > 0 ? Math.abs(total - (totalOnContracts + totalOnTokens) - (totalOnEVM + totalOnCosmos)) * 100 / (total - (totalOnContracts + totalOnTokens)) : null;

    // price
    const pricesData = await getTokensPrice({ symbol: is_custom && symbol ? symbol : asset });
    const { price } = { ...(pricesData[asset] || pricesData[symbol]) };

    data.push({
      asset,
      assetType: type,
      price,
      total,
      value: toNumber(total) * toNumber(price),
      total_on_evm: totalOnEVM,
      total_on_cosmos: totalOnCosmos,
      total_on_contracts: totalOnContracts,
      total_on_tokens: totalOnTokens,
      tvl: tvlsByChain,
      evm_escrow_address: evmEscrowAddress,
      evm_escrow_balance: evmEscrowBalance,
      evm_escrow_address_urls: evmEscrowURLs,
      percent_diff_supply: percentDiffSupply,
      is_abnormal_supply: percentDiffSupply > (evmEscrowAddress ? percent_diff_escrow_supply_threshold : percent_diff_total_supply_threshold),
      percent_diff_escrow_supply_threshold,
      percent_diff_total_supply_threshold,
      success: !!Object.values(tvlsByChain).find(d => !d.success),
    });
  }

  const response = { data, updated_at: moment().unix() };

  if (cacheId) {
    if (!data.find(d => d.success)) {
      // return cache data when cannot get result
      return await readCache(cacheId, 24 * CACHE_AGE, TOKEN_TVL_COLLECTION);
    }
    else if (!data.find(d => !d.success)) {
      // caching
      await writeCache(cacheId, data, TOKEN_TVL_COLLECTION, true);
      return response;
    }
  }
  else {
    for (const d of data.filter(d => d.success)) {
      // caching
      await writeCache(normalizeCacheId(d.asset), [d], TOKEN_TVL_COLLECTION, true);
    }
    return response;
  }
};