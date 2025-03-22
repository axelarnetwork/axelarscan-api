const _ = require('lodash');
const moment = require('moment');

const getTVL = require('./getTVL');
const { read } = require('../../services/indexer');
const { TOKEN_TVL_COLLECTION, getChainData, getAssets, getAssetData, getAppURL, getTVLConfig } = require('../../utils/config');
const { toArray } = require('../../utils/parser');
const { equalsIgnoreCase, toBoolean } = require('../../utils/string');
const { isNumber, toNumber } = require('../../utils/number');

const MAX_INTERVAL_UPDATE_SECONDS = 120 * 60;
const IGNORED_CHAINS = ['terra-2'];

const { alert_asset_escrow_value_threshold, alert_asset_value_threshold } = { ...getTVLConfig() };

module.exports = async params => {
  let { test } = { ...params };
  test = toBoolean(test, false);

  let { data } = { ...await read(TOKEN_TVL_COLLECTION, { range: { updated_at: { gt: moment().subtract(MAX_INTERVAL_UPDATE_SECONDS, 'seconds').unix() } } }, { size: 1000 }) };
  const { updated_at } = { ..._.head(data) };

  data = _.orderBy(toArray(toArray(data).map(d => _.head(toArray(d.data).filter(d => d.assetType !== 'its')))).map(d => {
    const { price, total, total_on_contracts, total_on_tokens, percent_diff_supply } = { ...d };
    return { ...d, value: toNumber(total * price), value_diff: toNumber((total - (total_on_contracts + total_on_tokens)) * (percent_diff_supply / 100) * price) };
  }), ['value_diff', 'value', 'total'], ['desc', 'desc', 'desc']);

  const toAlertData = data.filter(d => (d.is_abnormal_supply && d.value_diff > alert_asset_value_threshold) || (
    toArray(Object.values({ ...d.tvl })).findIndex(_d => _d.is_abnormal_supply) > -1 && Object.entries(d.tvl).findIndex(([k, v]) => {
      const { price } = { ...d };
      const { supply, escrow_balance, percent_diff_supply } = { ...v };
      return !IGNORED_CHAINS.includes(k) && toNumber((escrow_balance || supply) * (percent_diff_supply / 100) * price) > alert_asset_escrow_value_threshold;
    }) > -1
  ));

  data = test && toAlertData.length === 0 && data.length > 0 ? _.slice(data, 0, 1) : toAlertData;
  const timestamp = (updated_at ? moment(updated_at * 1000) : moment()).format();

  let native_on_evm_total_status = 'ok';
  let native_on_evm_escrow_status = 'ok';
  let native_on_cosmos_evm_escrow_status = 'ok';
  let native_on_cosmos_escrow_status = 'ok';
  let summary;
  let details;
  let links;

  if (data.length > 0) {
    const assetsData = await getAssets();
    details = await Promise.all(data.map(d => new Promise(async resolve => {
      const { asset, price, is_abnormal_supply, percent_diff_supply, total, value_diff, total_on_evm, total_on_cosmos, total_on_contracts, total_on_tokens, evm_escrow_address, evm_escrow_balance, evm_escrow_address_urls, tvl } = { ...d };
      const { native_chain, symbol, addresses } = { ...await getAssetData(asset, assetsData) };
      const { chain_type } = { ...getChainData(native_chain) };
      const app = getAppURL();
      const appUrls = app && [`${app}/tvl`, `${app}/transfers/search?asset=${asset}&fromTime=${moment().subtract(24, 'hours').unix()}&toTime=${moment().unix()}&sortBy=value`];

      resolve({
        asset, symbol, price,
        native_chain, native_on: chain_type,
        ...(is_abnormal_supply && value_diff > alert_asset_value_threshold ?
          {
            percent_diff_supply,
            total, total_on_evm, total_on_cosmos, total_on_contracts, total_on_tokens,
            evm_escrow_address, evm_escrow_balance,
            links: _.uniq(toArray(_.concat(
              evm_escrow_address_urls,
              toArray(tvl?.[native_chain]).flatMap(_d => _.concat(_d.url, _d.escrow_addresses_urls, _d.supply_urls)),
              appUrls,
            ))),
          } :
          {
            chains: Object.entries({ ...tvl }).filter(([k, v]) => !IGNORED_CHAINS.includes(k) && v?.is_abnormal_supply && toNumber((v.escrow_balance || v.supply) * (v.percent_diff_supply / 100) * price) > alert_asset_escrow_value_threshold).map(([k, v]) => {
              const { percent_diff_supply, contract_data, denom_data, gateway_address, gateway_balance, token_manager_address, token_manager_type, token_manager_balance, ibc_channels, escrow_addresses, escrow_balance, source_escrow_addresses, source_escrow_balance, url } = { ...v };
              let { supply } = { ...v };
              if (k === native_chain && k !== 'axelarnet') {
                const { total } = { ...tvl?.axelarnet };
                supply = isNumber(total) ? total : supply;
              }
              return {
                chain: k, percent_diff_supply, contract_data, denom_data, gateway_address, gateway_balance,
                token_manager_address, token_manager_type, token_manager_balance,
                ibc_channels, escrow_addresses, escrow_balance, source_escrow_addresses, source_escrow_balance,
                supply, link: d.url,
              };
            }),
            links: _.uniq(toArray(_.concat(toArray(Object.entries({ ...tvl })).filter(([k, v]) => !IGNORED_CHAINS.includes(k) && v.is_abnormal_supply).flatMap(_d => _.concat(_d.url, _d.escrow_addresses_urls, _d.supply_urls)))), appUrls),
          }
        ),
      });
    })));

    native_on_evm_total_status = details.findIndex(d => d.native_on === 'evm' && isNumber(d.percent_diff_supply)) > -1 ? 'alert' : 'ok';
    native_on_evm_escrow_status = details.findIndex(d => d.native_on === 'evm' && toArray(d.chains).findIndex(_d => isNumber(_d.percent_diff_supply)) > -1) > -1 ? 'alert' : 'ok';
    native_on_cosmos_evm_escrow_status = details.findIndex(d => d.native_on === 'cosmos' && isNumber(d.percent_diff_supply)) > -1 ? 'alert' : 'ok';
    native_on_cosmos_escrow_status = details.findIndex(d => d.native_on === 'cosmos' && toArray(d.chains).findIndex(_d => isNumber(_d.percent_diff_supply)) > -1) > -1 ? 'alert' : 'ok';

    const EVMDetails = [native_on_evm_total_status, native_on_evm_escrow_status].findIndex(s => s !== 'ok') > -1 ? details.filter(d => d.native_on === 'evm') : undefined;
    const cosmosDetails = [native_on_cosmos_evm_escrow_status, native_on_cosmos_escrow_status].findIndex(s => s !== 'ok') > -1 ? details.filter(d => d.native_on === 'cosmos') : undefined;
    summary = toArray(_.concat(EVMDetails, cosmosDetails)).map(d => d.symbol).join(', ');
    links = _.uniq(details.flatMap(d => d.links));

    if (data.length === 1) {
      const { asset } = { ..._.head(data) };
      if (asset) await getTVL({ asset, forceCache: true });
    }
  }

  return { summary, timestamp, native_on_evm_total_status, native_on_evm_escrow_status, native_on_cosmos_evm_escrow_status, native_on_cosmos_escrow_status, details, links };
};