const _ = require('lodash');

const { transfersStatsByTime } = require('./token-transfer');
const { GMPStatsByTime } = require('./gmp');
const { toArray } = require('../../utils/parser');
const { toNumber } = require('../../utils/number');

module.exports = async params => {
  const data = (
    await Promise.all(['transfers', 'gmp'].map(type => new Promise(async resolve => {
      let response;

      // get stats data of each type
      switch (type) {
        case 'transfers':
          response = await transfersStatsByTime(params);
          break;
        case 'gmp':
          response = await GMPStatsByTime(params);
          break;
        default:
          break;
      }

      resolve(toArray(response?.data).map(d => ({
        ...d,
        [`${type}_num_txs`]: d.num_txs,
        [`${type}_volume`]: d.volume,
      })));
    })))
  ).flatMap(d => d);

  // merge records by timestamp & source chain
  return {
    data: _.orderBy(
      Object.values(_.groupBy(data, 'id')).map(v => ({
        timestamp: toNumber(_.head(v).timestamp),
        source_chain: _.head(v).source_chain,
        num_txs: _.sumBy(v, 'num_txs'),
        volume: _.sumBy(v, 'volume'),
        gmp_num_txs: _.sumBy(v.filter(d => d.gmp_num_txs > 0), 'gmp_num_txs'),
        gmp_volume: _.sumBy(v.filter(d => d.gmp_volume > 0), 'gmp_volume'),
        transfers_num_txs: _.sumBy(v.filter(d => d.transfers_num_txs > 0), 'transfers_num_txs'),
        transfers_volume: _.sumBy(v.filter(d => d.transfers_volume > 0), 'transfers_volume'),
      })),
      ['timestamp'], ['asc'],
    ),
  };
};