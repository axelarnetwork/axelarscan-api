const { toArray } = require('../../../utils/parser');
const { toNumber } = require('../../../utils/number');

module.exports = async params => {
  const { query } = { ...params };
  return {
    bool: {
      must: toArray(
        Object.entries({ ...params })
          .filter(
            ([k, v]) =>
              ![
                'method',
                'query',
                'aggs',
                'fields',
                '_source',
                'from',
                'size',
                'sort',
              ].includes(k)
          )
          .map(([k, v]) => {
            if (!v) return;
            switch (k) {
              case 'symbol':
                return { match: { symbol: v } };
              case 'fromTime':
                return {
                  range: { 'granularity.ms': { gte: toNumber(v) * 1000 } },
                };
              case 'toTime':
                return {
                  range: { 'granularity.ms': { lte: toNumber(v) * 1000 } },
                };
              default:
                break;
            }
            return;
          })
      ),
      ...query?.bool,
    },
  };
};
