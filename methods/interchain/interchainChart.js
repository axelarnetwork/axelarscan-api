const _ = require('lodash');

const { transfersChart } = require('./token-transfer');
const { GMPChart } = require('./gmp');
const { toArray } = require('../../utils/parser');
const { toNumber } = require('../../utils/number');

module.exports = async params => {
  const data = (
    await Promise.all(
      ['transfers', 'gmp'].map(
        type =>
          new Promise(async resolve => {
            let response;

            // get chart data of each type
            switch (type) {
              case 'transfers':
                response = await transfersChart(params);
                break;
              case 'gmp':
                response = await GMPChart(params);
                break;
              default:
                break;
            }

            resolve(
              toArray(response?.data).map(d => ({
                ...d,
                [`${type}_num_txs`]: d.num_txs,
                [`${type}_volume`]: d.volume,
              }))
            );
          })
      )
    )
  ).flatMap(d => d);

  // merge records by timestamp and sort asc
  return {
    data: _.orderBy(
      Object.entries(_.groupBy(data, 'timestamp')).map(([k, v]) => ({
        timestamp: toNumber(k),
        num_txs: _.sumBy(v, 'num_txs'),
        volume: _.sumBy(v, 'volume'),
        gmp_num_txs: _.sumBy(
          v.filter(d => d.gmp_num_txs > 0),
          'gmp_num_txs'
        ),
        gmp_volume: _.sumBy(
          v.filter(d => d.gmp_volume > 0),
          'gmp_volume'
        ),
        transfers_num_txs: _.sumBy(
          v.filter(d => d.transfers_num_txs > 0),
          'transfers_num_txs'
        ),
        transfers_volume: _.sumBy(
          v.filter(d => d.transfers_volume > 0),
          'transfers_volume'
        ),
      })),
      ['timestamp'],
      ['asc']
    ),
  };
};
