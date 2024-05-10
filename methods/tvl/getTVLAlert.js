const _ = require('lodash');
const moment = require('moment');

const getTVL = require('./getTVL');
const { read } = require('../../services/indexer');
const { TVL_COLLECTION, getChainData, getAssetsList, getAssetData, getAppURL, getTVLConfig } = require('../../utils/config');
const { toArray } = require('../../utils/parser');
const { equalsIgnoreCase, toBoolean } = require('../../utils/string');
const { isNumber, toNumber } = require('../../utils/number');

const MAX_INTERVAL_UPDATE_SECONDS = 60 * 60;

module.exports = async params => {
  let { test } = { ...params };
  test = toBoolean(test, false);
  const { alert_asset_value_threshold } = { ...getTVLConfig() };

  let { data } = { ...await read(TVL_COLLECTION, { range: { updated_at: { gt: moment().subtract(MAX_INTERVAL_UPDATE_SECONDS, 'seconds').unix() } } }, { size: 1000 }) };
  const { updated_at } = { ..._.head(data) };

  data = _.orderBy(toArray(toArray(data).filter(d => d.assetType !== 'its').map(d => _.head(d.data))).map(d => {
    const { price, total, percent_diff_supply } = { ...d };
    return { ...d, value: toNumber(total * price), value_diff: toNumber(total * (percent_diff_supply / 100) * price) };
  }), ['value_diff', 'value', 'total'], ['desc', 'desc', 'desc']);

  const toAlertData = data.filter(d => (d.is_abnormal_supply && d.value_diff > alert_asset_value_threshold) || (
    toArray(Object.values({ ...d.tvl })).findIndex(_d => _d.is_abnormal_supply) > -1 && _.sum(
      Object.values(d.tvl).map(_d => {
        const { price } = { ...d };
        const { supply, escrow_balance, percent_diff_supply } = { ..._d };
        return toNumber((supply || escrow_balance) * (percent_diff_supply / 100) * price);
      })
    ) > alert_asset_value_threshold
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
    const assetsData = await getAssetsList();
    details = await Promise.all(data.map(d => new Promise(async resolve => {
      const { asset, price, is_abnormal_supply, percent_diff_supply, total, value, total_on_evm, total_on_cosmos, evm_escrow_address, evm_escrow_balance, evm_escrow_address_urls, tvl } = { ...d };
      const { native_chain, symbol, addresses } = { ...await getAssetData(asset, assetsData) };
      const { chain_type } = { ...getChainData(native_chain) };
      const app = getAppURL();
      const appUrls = app && [`${app}/tvl`, `${app}/transfers/search?asset=${asset}&fromTime=${moment().subtract(24, 'hours').unix()}&toTime=${moment().unix()}&sortBy=value`];

      resolve({
        asset, symbol, price,
        native_chain, native_on: chain_type,
        ...(is_abnormal_supply && value > alert_asset_value_threshold ?
          {
            percent_diff_supply,
            total, total_on_evm, total_on_cosmos,
            evm_escrow_address, evm_escrow_balance,
            links: _.uniq(toArray(_.concat(
              evm_escrow_address_urls,
              toArray(tvl?.[native_chain]).flatMap(_d => _.concat(_d.url, _d.escrow_addresses_urls, _d.supply_urls)),
              appUrls,
            ))),
          } :
          {
            chains: Object.entries({ ...tvl }).filter(([k, v]) => v?.is_abnormal_supply).map(([k, v]) => {
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
            links: _.uniq(toArray(_.concat(toArray(Object.values({ ...tvl })).filter(_d => _d.is_abnormal_supply).flatMap(_d => _.concat(_d.url, _d.escrow_addresses_urls, _d.supply_urls)))), appUrls),
          }
        ),
      });
    })));

    native_on_evm_total_status = details.findIndex(d => d.native_on === 'evm' && isNumber(d.percent_diff_supply)) > -1 ? 'alert' : 'ok';
    native_on_evm_escrow_status = details.findIndex(d => d.native_on === 'evm' && toArray(d.chains).findIndex(_d => isNumber(_d.percent_diff_supply)) > -1) ? 'alert' : 'ok';
    native_on_cosmos_evm_escrow_status = details.findIndex(d => d.native_on === 'cosmos' && isNumber(d.percent_diff_supply)) > -1 ? 'alert' : 'ok';
    native_on_cosmos_escrow_status = details.findIndex(d => d.native_on === 'cosmos' && toArray(d.chains).findIndex(_d => isNumber(_d.percent_diff_supply)) > -1) > -1 ? 'alert' : 'ok';

    const EVMDetails = [native_on_evm_total_status, native_on_evm_escrow_status].findIndex(s => s !== 'ok') > -1 ? details.filter(d => d.native_on === 'evm') : undefined;
    const cosmosDetails = [native_on_cosmos_evm_escrow_status, native_on_cosmos_escrow_status].findIndex(s => s !== 'ok') > -1 ? details.filter(d => d.native_on === 'cosmos') : undefined;
    summary = toArray(_.concat(EVMDetails, cosmosDetails)).map(d => d.symbol).join(', ');
    links = _.uniq(details.flatMap(d => d.links));

    if (data.length === 1) {
      const { asset } = { ..._.head(data) };
      if (asset) await getTVL({ asset, force_update: true });
    }
  }

  return { summary, timestamp, native_on_evm_total_status, native_on_evm_escrow_status, native_on_cosmos_evm_escrow_status, native_on_cosmos_escrow_status, details, links };
};