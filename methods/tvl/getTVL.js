const { ZeroAddress } = require('ethers');
const _ = require('lodash');
const moment = require('moment');

const saveIBCChannels = require('./saveIBCChannels');
const { normalizeParams, getCustomContractsData, getCustomTokensData, getTVLAssets, getTVLChains, getContractData, getChainType, isSecretSnipChain, isSecretChain } = require('./utils');
const { getTokensPrice, getTokenCirculatingSupply } = require('../tokens');
const { read } = require('../../services/indexer');
const { TOKEN_TVL_COLLECTION, IBC_CHANNEL_COLLECTION, getChainData, getAxelarS3Config, getTVLConfig } = require('../../utils/config');
const { getBalance, getTokenSupply } = require('../../utils/chain/evm');
const { getCosmosBalance, getIBCSupply } = require('../../utils/chain/cosmos');
const { getRPCs } = require('../../utils/chain/amplifier');
const { readCache, readMultipleCache, writeCache } = require('../../utils/cache');
const { toHash, getBech32Address, toArray } = require('../../utils/parser');
const { sleep } = require('../../utils/operator');
const { lastString, find } = require('../../utils/string');
const { isNumber, toNumber } = require('../../utils/number');
const { timeDiff } = require('../../utils/time');

const CACHE_AGE = 4 * 3600;
const IBC_CHANNELS_CACHE_AGE = 24 * 3600;

const { percent_diff_escrow_supply_threshold, percent_diff_total_supply_threshold } = { ...getTVLConfig() };

module.exports = async params => {
  params = normalizeParams(params);
  const { forceCache, isIntervalUpdate } = { ...params };

  // get assets
  const assetsData = await getTVLAssets(params);
  const gatewayAssetsData = assetsData.filter(d => d.type === 'gateway');
  const itsAssetsData = assetsData.filter(d => d.type === 'its');

  // get chains
  const chainsData = getTVLChains(params, ['evm', 'cosmos', 'amplifier']);
  const cosmosChainsData = chainsData.filter(d => d.chain_type === 'cosmos');
  const isAllChains = chainsData.length >= getTVLChains(undefined, ['evm', 'cosmos', 'amplifier']).length;
  const isAllCosmosChains = cosmosChainsData.length >= getTVLChains(undefined, ['cosmos']).length;

  // get axelar
  const axelar = getChainData('axelarnet', 'cosmos');
  const axelarLCD = _.head(axelar.endpoints?.lcd);

  // set cacheId on querying single asset on every chains
  const cacheId = assetsData.length === 1 && isAllChains && assetsData[0].id;

  if (!forceCache) {
    // get tvl from cache
    const cache = await readCache(cacheId, CACHE_AGE, TOKEN_TVL_COLLECTION);
    if (cache) return cache;
  }

  let cachesData;
  // use cache when no forceCache and get multiple assets or isIntervalUpdate
  if (!forceCache ? assetsData.length > 1 && isAllChains : isIntervalUpdate) {
    // get tvl of assets from cache
    const data = await readMultipleCache(assetsData.map(d => d.id), CACHE_AGE, TOKEN_TVL_COLLECTION);

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

  // results
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
    const isNativeOnAmplifier = !!getChainData(native_chain, 'amplifier');
    const isNativeOnAxelar = native_chain === axelar.id;
    const isCanonicalITS = type === 'its' && Object.values({ ...addresses }).findIndex(d => d.token_manager_type?.startsWith('lockUnlock')) > -1;

    let tvlsByChain = Object.fromEntries((await Promise.all(
      chainsData.map(d => new Promise(async resolve => {
        const { id: chain, chain_type, gateway, endpoints, explorer, prefix_chain_ids } = { ...d };
        const { url, address_path, contract_path, asset_path } = { ...explorer };
        const LCD = _.head(endpoints?.lcd);

        // is processing on native chain
        const isNative = native_chain && chain === native_chain;

        let tvlData;

        switch (chain_type) {
          case 'evm':
            try {
              // create contract data from asset and chain data
              const contractData = getContractData(assetData, d);
              const { address, token_manager_address, token_manager_type } = { ...contractData };

              if (address) {
                // get balance of this asset on gateway
                const gatewayBalance = type === 'gateway' ? toNumber(await getBalance(chain, gateway.address, contractData)) : 0;

                // check token manager type is lockUnlock
                const isLockUnlock = type === 'its' && token_manager_address && token_manager_type?.startsWith('lockUnlock');
                // get balance of this asset on token manager
                const tokenManagerBalance = isLockUnlock ? toNumber(await getBalance(chain, token_manager_address, contractData)) : 0;

                // for lockUnlock, supply = tokenManagerBalance, otherwise supply = getTokenSupply
                const supply = (!isNative || type === 'its') && !is_custom ? isLockUnlock ? tokenManagerBalance : toNumber(await getTokenSupply(chain, contractData)) : 0;

                // custom contracts with their asset balance
                const customContractsBalances = await Promise.all(getCustomContractsData(d, assetData).map(c => new Promise(async resolve =>
                  resolve({
                    address: c.address,
                    balance: toNumber(await getBalance(chain, c.address, _.head(c.assets))),
                    url: `${url}${(_.head(c.assets)?.address === ZeroAddress ? address_path : contract_path).replace('{address}', _.head(c.assets)?.address === ZeroAddress ? c.address : `${_.head(c.assets)?.address}?a=${c.address}`)}`,
                  })
                )));

                // custom tokens supply
                const customTokensSupply = await Promise.all(getCustomTokensData(d, assetData).map(a => new Promise(async resolve => {
                  // token address of this chain
                  const address = a.addresses[chain];

                  resolve({
                    address,
                    supply: toNumber(await getTokenSupply(chain, { ...a, address })),
                    url: `${url}${(address === ZeroAddress ? address_path : contract_path).replace('{address}', address)}`,
                  });
                })));

                tvlData = {
                  // contract
                  contract_data: contractData,
                  // gateway
                  gateway_address: gateway.address,
                  gateway_balance: gatewayBalance,
                  // token manager
                  ...(isLockUnlock ? {
                    token_manager_address,
                    token_manager_type,
                    token_manager_balance: tokenManagerBalance,
                  } : undefined),
                  // amount
                  supply,
                  total: isNativeOnCosmos || isNativeOnAmplifier ? 0 : gatewayBalance + supply,
                  // custom contracts
                  custom_contracts_balance: customContractsBalances,
                  total_balance_on_custom_contracts: _.sumBy(customContractsBalances, 'balance'),
                  // custom tokens
                  custom_tokens_supply: customTokensSupply,
                  total_supply_of_custom_tokens: _.sumBy(customTokensSupply, 'supply'),
                  // link
                  url: `${url}${(address === ZeroAddress ? address_path : contract_path).replace('{address}', address === ZeroAddress ? gateway.address : address)}${isNative && address !== ZeroAddress ? gateway.address && type === 'gateway' ? `?a=${gateway.address}` : isLockUnlock ? `?a=${token_manager_address}` : '' : ''}`,
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
                let ibcChannels;
                let escrowAddresses;
                let sourceEscrowAddresses;

                if (chain !== axelar.id && toArray(prefix_chain_ids).length > 0) {
                  let wasRun;

                  while (!wasRun) {
                    // channel id from axelar s3 config
                    const { channelId } = { ...axelars3Config?.chains?.[chain]?.config?.ibc?.fromAxelar };

                    const { data } = { ...await read(IBC_CHANNEL_COLLECTION, {
                      bool: {
                        must: toArray([
                          channelId ? { match: { channel_id: channelId } } : undefined,
                          { match: { state: 'STATE_OPEN' } },
                        ]),
                        should: prefix_chain_ids.map(p => ({ match_phrase_prefix: { chain_id: p } })),
                        minimum_should_match: 1,
                      },
                    }, { size: 1000, sort: [{ updated_at: 'asc' }] }) };

                    // cache hit
                    if (toArray(data).length > 0 && !data.find(d => timeDiff(d.updated_at * 1000) > IBC_CHANNELS_CACHE_AGE)) {
                      // filter ibc channels by channelId
                      ibcChannels = _.orderBy(data.filter(d => (!channelId && !isSecretChain(chain)) || d.channel_id === channelId), ['latest_height'], ['asc']);

                      // get escrow addresses from ibc channels
                      escrowAddresses = toArray(ibcChannels.map(d => d.escrow_address));
                      sourceEscrowAddresses = toArray(ibcChannels.map(d => d.counterparty?.escrow_address));

                      wasRun = true;
                    }
                    else if (data) {
                      // index ibc channels
                      await saveIBCChannels();

                      // query from collection again after first time index
                      wasRun = typeof wasRun === 'boolean' || false;
                    }

                    // delay for updating ibc channels
                    await sleep(3000);
                  }
                }

                // get asset balance of escrow addresses on axelar
                const escrowBalance = isSecretChain(chain) ? undefined : _.sum(await Promise.all(toArray(escrowAddresses)
                  .map(a => new Promise(async resolve =>
                    resolve(toNumber(await getCosmosBalance(axelar.id, a, contractData)))
                  ))
                ));

                // get asset balance of source escrow addresses on cosmos chain
                const sourceEscrowBalance = _.sum(await Promise.all(toArray(sourceEscrowAddresses)
                  .map(a => new Promise(async resolve =>
                    resolve(toNumber(await getCosmosBalance(chain, a, contractData)))
                  ))
                ));

                // flags
                const isNativeOnCosmos = isNative && chain !== axelar.id;
                const isNotNativeOnAxelar = !isNative && chain === axelar.id;

                let supply = isNative ?
                  chain !== axelar.id ? sourceEscrowBalance : 0 : // use source escrow balance when native on cosmos chain
                  toArray(escrowAddresses).length > 0 ? await getIBCSupply(chain, contractData) : 0; // get ibc supply on this chain

                // parse supply to number
                if (isNumber(supply)) {
                  supply = toNumber(supply);
                }

                let total = isNotNativeOnAxelar ?
                  await getIBCSupply(chain, contractData) : // on axelar and not native, get ibc supply
                  isNativeOnCosmos ?
                    await getIBCSupply(axelar.id, { ...contractData, ibc_denom: denom }) : // when native on cosmos, get ibc supply on axelar
                    isSecretSnipChain(chain) ? escrowBalance : 0; // use escrow balance when secret-snip

                // parse total to number
                if (isNumber(total)) {
                  total = toNumber(total);
                }

                // get ibc supply on axelar when native on cosmos
                const totalSupply = isNativeOnCosmos ? toNumber(await getIBCSupply(axelar.id, contractData)) : 0;

                const percentDiffSupply = isNativeOnCosmos ?
                  // compare total supply on axelar with source escrow balance
                  totalSupply > 0 && sourceEscrowBalance > 0 ? Math.abs(sourceEscrowBalance - totalSupply) * 100 / sourceEscrowBalance : null :
                  // compare supply with escrow balance
                  supply > 0 && escrowBalance > 0 ? Math.abs(escrowBalance - supply) * 100 / escrowBalance : null;

                tvlData = {
                  // contract
                  denom_data: contractData,
                  // escrow
                  ibc_channels: ibcChannels,
                  escrow_addresses: escrowAddresses,
                  escrow_balance: escrowBalance,
                  source_escrow_addresses: sourceEscrowAddresses,
                  source_escrow_balance: sourceEscrowBalance,
                  // amount
                  supply,
                  total,
                  percent_diff_supply: percentDiffSupply,
                  is_abnormal_supply: percentDiffSupply > percent_diff_escrow_supply_threshold,
                  // link
                  url: isNativeOnCosmos && toArray(sourceEscrowAddresses).length > 0 ?
                    `${url}${address_path?.replace('{address}', _.last(sourceEscrowAddresses))}` :
                    ibc_denom.includes('/') && !isSecretSnipChain(chain) ?
                      `${url}${asset_path?.replace('{ibc_denom}', Buffer.from(lastString(ibc_denom, { delimiter: '/' })).toString('base64'))}` :
                      toArray(escrowAddresses).length > 0 ?
                        `${axelar.explorer?.url}${axelar.explorer?.address_path?.replace('{address}', isSecretSnipChain(chain) ? _.head(escrowAddresses) : _.last(escrowAddresses))}` : null,
                  escrow_addresses_urls: isNativeOnCosmos ?
                    _.reverse(_.cloneDeep(toArray(sourceEscrowAddresses))).flatMap(a => [
                      `${url}${address_path.replace('{address}', a)}`,
                      `${LCD}/cosmos/bank/v1beta1/balances/${a}/by_denom?denom=${encodeURIComponent(ibc_denom)}`,
                      `${LCD}/cosmos/bank/v1beta1/balances/${a}`,
                    ]) :
                    _.reverse(_.cloneDeep(toArray(escrowAddresses))).flatMap(a => toArray([
                      `${axelar.explorer?.url}${axelar.explorer?.address_path?.replace('{address}', a)}`,
                      denom && `${axelarLCD}/cosmos/bank/v1beta1/balances/${a}/by_denom?denom=${encodeURIComponent(denom)}`,
                      `${axelarLCD}/cosmos/bank/v1beta1/balances/${a}`,
                    ])),
                  supply_urls: !isNativeOnCosmos && toArray(escrowAddresses).length > 0 ? [`${LCD}/cosmos/bank/v1beta1/supply/${encodeURIComponent(ibc_denom)}`, `${LCD}/cosmos/bank/v1beta1/supply`] : [],
                  // status
                  success: isNumber(isNotNativeOnAxelar ? total : supply) || d.unstable,
                };
              }
            } catch (error) {}
            break;
          case 'vm':
            try {
              // create contract data from asset and chain data
              const contractData = getContractData(assetData, d);
              const { address, token_manager_address, token_manager_type } = { ...contractData };

              if (address) {
                // get balance of this asset on gateway
                const gatewayBalance = type === 'gateway' ? toNumber(await getRPCs(chain)?.getBalance(gateway.address, contractData)) : 0;

                // check token manager type is lockUnlock
                const isLockUnlock = type === 'its' && token_manager_address && token_manager_type?.startsWith('lockUnlock');
                // get balance of this asset on token manager
                const tokenManagerBalance = isLockUnlock ? toNumber(await getRPCs(chain)?.getBalance(token_manager_address, contractData)) : 0;

                // for lockUnlock, supply = tokenManagerBalance, otherwise supply = getTokenSupply
                const supply = (!isNative || type === 'its') && !is_custom ? isLockUnlock ? tokenManagerBalance : toNumber(await getRPCs(chain)?.getTokenSupply(contractData)) : 0;

                tvlData = {
                  // contract
                  contract_data: contractData,
                  // gateway
                  gateway_address: gateway.address,
                  gateway_balance: gatewayBalance,
                  // token manager
                  ...(isLockUnlock ? {
                    token_manager_address,
                    token_manager_type,
                    token_manager_balance: tokenManagerBalance,
                  } : undefined),
                  // amount
                  supply,
                  total: isNativeOnEVM || isNativeOnCosmos ? 0 : gatewayBalance + supply,
                  // link
                  url: isNumber(d.chain_id) ?
                    `${url}${(address === ZeroAddress ? address_path : contract_path).replace('{address}', address === ZeroAddress ? gateway.address : address)}${isNative && address !== ZeroAddress ? gateway.address && type === 'gateway' ? `?a=${gateway.address}` : isLockUnlock ? `?a=${token_manager_address}` : '' : ''}` :
                    `${url}${(isLockUnlock ? address_path : contract_path).replace('{address}', isLockUnlock ? token_manager_address : address)}`,
                  // status
                  success: isNumber(isNative && type === 'gateway' ? gatewayBalance : supply),
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
            // supply on axelar = total - sum(supply of others chain type)
            v.supply = v.total - _.sum(Object.entries(tvlsByChain)
              .filter(([k, v]) => find(getChainType(k), isNativeOnEVM ? ['cosmos', 'vm'] : isNativeOnCosmos ? ['evm', 'vm'] : ['evm', 'cosmos'])) // filter by chain type
              .map(([k, v]) => toNumber(isSecretSnipChain(k) ? v.total : v.supply))
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
      .map(([k, v]) => toNumber(isAllCosmosChains ? isNativeOnCosmos || isSecretSnipChain(k) ? v.supply : v.total : v.escrow_balance))
    );

    let totalOnAmplifier = !(type === 'gateway' || isCanonicalITS) ? 0 : _.sum(Object.entries(tvlsByChain)
      .filter(([k, v]) => getChainType(k) === 'vm' && !v.token_manager_type?.startsWith('lockUnlock'))
      .map(([k, v]) => toNumber(v.supply))
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
      isNativeOnCosmos || isNativeOnAxelar ? totalOnEVM + totalOnCosmos + totalOnAmplifier :
      type === 'its' ?
        isCanonicalITS ?
          _.sum(Object.values(tvlsByChain).map(v => toNumber(v.token_manager_balance))) : // lockUnlock token manager balances
          toNumber(await getTokenCirculatingSupply(coingecko_id)) : // circulating supply from coingecko
        _.sum(Object.values(tvlsByChain).map(v => toNumber(isNativeOnEVM ? v.gateway_balance : v.total))) // gateway balances for native on evm, otherwise total
    );

    // when asset is ITS which isn't lockUnlock
    if (type === 'its' && !isCanonicalITS) {
      // total on evm += total
      if (isNativeOnEVM) {
        totalOnEVM += total;
      }

      // total on amplifier += total
      if (isNativeOnAmplifier) {
        totalOnAmplifier += total;
      }
    }

    // generate evm escrow address when native on cosmos
    const evmEscrowAddress = isNativeOnCosmos ? getBech32Address(isNativeOnAxelar ? asset : `ibc/${toHash(`transfer/${_.last(tvlsByChain[native_chain]?.ibc_channels)?.channel_id}/${asset}`)}`, axelar.prefix_address, 32) : undefined;

    // get axelar asset balance of evm escrow address
    const evmEscrowBalance = evmEscrowAddress ? toNumber(await getCosmosBalance(axelar.id, evmEscrowAddress, getContractData(assetData, axelar))) : 0;

    // debug urls of evm escrow address
    const evmEscrowURLs = !evmEscrowAddress ? undefined : [
      `${axelar.explorer?.url}${axelar.explorer?.address_path?.replace('{address}', evmEscrowAddress)}`,
      `${axelarLCD}/cosmos/bank/v1beta1/balances/${evmEscrowAddress}`,
    ];

    const percentDiffSupply = evmEscrowAddress ?
      // compare evm escrow balance with total on evm
      evmEscrowBalance > 0 && totalOnEVM > 0 ? Math.abs(evmEscrowBalance - totalOnEVM) * 100 / evmEscrowBalance : null :
      // compare total with total on evm + total on cosmos
      total > 0 && totalOnEVM + totalOnCosmos + totalOnAmplifier > 0 ? Math.abs(total - (totalOnContracts + totalOnTokens) - (totalOnEVM + totalOnCosmos + totalOnAmplifier)) * 100 / (total - (totalOnContracts + totalOnTokens)) : null;

    // price
    const pricesData = await getTokensPrice({ symbol: is_custom && symbol ? symbol : asset });
    const { price } = { ...(pricesData[asset] || pricesData[symbol]) };

    data.push({
      asset,
      assetType: type,
      price,
      // amount
      total,
      value: toNumber(total) * toNumber(price),
      total_on_evm: totalOnEVM,
      total_on_cosmos: totalOnCosmos,
      total_on_amplifier: totalOnAmplifier,
      total_on_contracts: totalOnContracts,
      total_on_tokens: totalOnTokens,
      tvl: tvlsByChain,
      // evm escrow
      evm_escrow_address: evmEscrowAddress,
      evm_escrow_balance: evmEscrowBalance,
      evm_escrow_address_urls: evmEscrowURLs,
      // status
      percent_diff_supply: percentDiffSupply,
      is_abnormal_supply: percentDiffSupply > (evmEscrowAddress ? percent_diff_escrow_supply_threshold : percent_diff_total_supply_threshold),
      percent_diff_escrow_supply_threshold,
      percent_diff_total_supply_threshold,
      success: !Object.values(tvlsByChain).find(d => !d.success),
    });
  }

  const response = { data, updated_at: moment().unix() };

  if (cacheId) {
    if (!data.find(d => d.success)) {
      // return cache data when cannot get result
      const cache = await readCache(cacheId, 24 * CACHE_AGE, TOKEN_TVL_COLLECTION);
      if (cache) return cache;
    }
    else if (!data.find(d => !d.success)) {
      // caching
      await writeCache(cacheId, data, TOKEN_TVL_COLLECTION, true);
    }
  }
  else {
    for (const d of data.filter(d => d.success)) {
      // caching
      await writeCache(d.asset, [d], TOKEN_TVL_COLLECTION, true);
    }
  }

  return response;
};