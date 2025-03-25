const _ = require('lodash');
const moment = require('moment');

const getTVL = require('./getTVL');
const { getChainType } = require('./utils');
const { read } = require('../../services/indexer');
const { TOKEN_TVL_COLLECTION, getChainData, getAssets, getAssetData, getTVLConfig, getAppURL } = require('../../utils/config');
const { toArray } = require('../../utils/parser');
const { isNumber, toNumber } = require('../../utils/number');

const MAX_INTERVAL_UPDATE = 6 * 3600;

const { alert_asset_escrow_value_threshold, alert_asset_value_threshold } = { ...getTVLConfig() };

module.exports = async () => {
  // get tvls from cache
  let { data } = { ...await read(TOKEN_TVL_COLLECTION, {
    bool: {
      must: [
        { match: { 'data.assetType': 'gateway' } },
        { exists: { field: 'data.price' } },
        { exists: { field: 'data.total' } },
        { exists: { field: 'data.percent_diff_supply' } },
        { exists: { field: 'data.tvl' } },
        { range: { updated_at: { gt: moment().subtract(MAX_INTERVAL_UPDATE, 'seconds').valueOf() } } },
      ],
    },
  }, { size: 1000 }) };

  // set value of supply diff
  data = _.orderBy(
    toArray(data).flatMap(d => toArray(d.data)).map(d => ({
      ...d,
      value_diff: toNumber((d.total - (d.total_on_contracts + d.total_on_tokens)) * (d.percent_diff_supply / 100) * d.price),
      tvl: Object.fromEntries(Object.entries(d.tvl).map(([k, v]) => [k, {
        ...v,
        is_abnormal_supply: !getChainData(k)?.no_alert_tvl && v.is_abnormal_supply,
        value_diff: toNumber((v.escrow_balance || v.supply) * (v.percent_diff_supply / 100) * d.price),
      }])),
    })),
    ['value_diff', 'value', 'total'], ['desc', 'desc', 'desc'],
  );

  // filter tvls to alert
  const toAlertData = data.filter(d =>
    (d.is_abnormal_supply && d.value_diff > alert_asset_value_threshold) || // value of supply diff > threshold
    Object.entries(d.tvl).find(([k, v]) => v.is_abnormal_supply && v.value_diff > alert_asset_escrow_value_threshold) // value of escrow balance diff > threshold
  );

  let native_on_evm_total_status = 'ok';
  let native_on_evm_escrow_status = 'ok';
  let native_on_cosmos_evm_escrow_status = 'ok';
  let native_on_cosmos_escrow_status = 'ok';
  let summary;
  let details;
  let links;

  if (toAlertData.length > 0) {
    const assetsData = await getAssets();

    // to alert details
    details = await Promise.all(toAlertData.map(d => new Promise(async resolve => {
      const { native_chain, symbol } = { ...await getAssetData(d.asset, assetsData) };

      // urls to initial check
      const appURLs = [`${getAppURL()}/tvl`, `${getAppURL()}/transfers/search?asset=${d.asset}&fromTime=${moment().subtract(24, 'hours').unix()}&toTime=${moment().unix()}&sortBy=value`];

      resolve({
        asset: d.asset,
        symbol,
        price: d.price,
        native_chain,
        native_on: getChainType(native_chain),
        ...(d.is_abnormal_supply && d.value_diff > alert_asset_value_threshold ?
          {
            // amount
            percent_diff_supply: d.percent_diff_supply,
            total: d.total,
            total_on_evm: d.total_on_evm,
            total_on_cosmos: d.total_on_cosmos,
            total_on_contracts: d.total_on_contracts,
            total_on_tokens: d.total_on_tokens,
            // evm escrow
            evm_escrow_address: d.evm_escrow_address,
            evm_escrow_balance: d.evm_escrow_balance,
            // link
            links: _.uniq(toArray(_.concat(
              d.evm_escrow_address_urls,
              toArray(d.tvl[native_chain]).flatMap(v => _.concat(v.url, v.escrow_addresses_urls, v.supply_urls)),
              appURLs,
            ))),
          } :
          {
            chains: Object.entries(d.tvl).filter(([k, v]) => v.is_abnormal_supply && v.value_diff > alert_asset_escrow_value_threshold).map(([k, v]) => {
              let { supply } = { ...v };

              // native chain and not axelar
              if (k === native_chain && k !== 'axelarnet') {
                const { total } = { ...d.tvl.axelarnet };

                // set total axelar to supply of native chain
                supply = isNumber(total) ? total : supply;
              }

              return {
                chain: k,
                // amount
                percent_diff_supply: v.percent_diff_supply,
                supply,
                // contract
                contract_data: v.contract_data,
                denom_data: v.denom_data,
                // gateway
                gateway_address: v.gateway_address,
                gateway_balance: v.gateway_balance,
                // token manager
                token_manager_address: v.token_manager_address,
                token_manager_type: v.token_manager_type,
                token_manager_balance: v.token_manager_balance,
                // escrow
                ibc_channels: v.ibc_channels,
                escrow_addresses: v.escrow_addresses,
                escrow_balance: v.escrow_balance,
                source_escrow_addresses: v.source_escrow_addresses,
                source_escrow_balance: v.source_escrow_balance,
                // link
                link: v.url,
              };
            }),
            links: _.uniq(toArray(_.concat(
              Object.values(d.tvl).filter(v => v.is_abnormal_supply).flatMap(v => _.concat(v.url, v.escrow_addresses_urls, v.supply_urls)),
              appURLs,
            ))),
          }
        ),
      });
    })));

    // statuses
    native_on_evm_total_status = details.findIndex(d => d.native_on === 'evm' && isNumber(d.percent_diff_supply)) > -1 ? 'alert' : 'ok';
    native_on_evm_escrow_status = details.findIndex(d => d.native_on === 'evm' && toArray(d.chains).findIndex(c => isNumber(c.percent_diff_supply)) > -1) > -1 ? 'alert' : 'ok';
    native_on_cosmos_evm_escrow_status = details.findIndex(d => d.native_on === 'cosmos' && isNumber(d.percent_diff_supply)) > -1 ? 'alert' : 'ok';
    native_on_cosmos_escrow_status = details.findIndex(d => d.native_on === 'cosmos' && toArray(d.chains).findIndex(c => isNumber(c.percent_diff_supply)) > -1) > -1 ? 'alert' : 'ok';

    // details
    const evmDetails = [native_on_evm_total_status, native_on_evm_escrow_status].findIndex(s => s !== 'ok') > -1 ? details.filter(d => d.native_on === 'evm') : undefined;
    const cosmosDetails = [native_on_cosmos_evm_escrow_status, native_on_cosmos_escrow_status].findIndex(s => s !== 'ok') > -1 ? details.filter(d => d.native_on === 'cosmos') : undefined;

    // set list of symbols to summary
    summary = toArray(_.concat(evmDetails, cosmosDetails)).map(d => d.symbol).join(', ');

    // try get tvl when only one asset alerted
    if (toAlertData.length === 1) {
      const { asset } = { ..._.head(toAlertData) };

      if (asset) {
        // force update tvl of this asset
        await getTVL({ asset, forceCache: true });
      }
    }
  }

  return {
    summary,
    timestamp: moment(_.head(toAlertData)?.updated_at).format(),
    native_on_evm_total_status,
    native_on_evm_escrow_status,
    native_on_cosmos_evm_escrow_status,
    native_on_cosmos_escrow_status,
    details,
    links: details && _.uniq(details.flatMap(d => d.links)),
  };
};