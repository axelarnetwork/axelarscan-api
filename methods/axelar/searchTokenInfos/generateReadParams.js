const { isNumber, toNumber } = require('../../../utils/number');

module.exports = params => {
  const { aggs, fields, _source, from, size, sort } = { ...params };
  return {
    aggs: aggs || undefined,
    fields: fields || undefined,
    _source: _source || undefined,
    from: toNumber(from),
    size: isNumber(size) ? toNumber(size) : 25,
    sort: sort || [{ 'granularity.ms': 'desc' }],
    track_total_hits: true,
  };
};