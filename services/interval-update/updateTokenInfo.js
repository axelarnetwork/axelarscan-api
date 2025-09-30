const moment = require('moment');

const { getTokenInfo } = require('../../methods');
const { write } = require('../../services/indexer');
const { TOKEN_INFO_COLLECTION } = require('../../utils/config');
const { toCase } = require('../../utils/parser');
const { getGranularity } = require('../../utils/time');

module.exports = async params => {
  const data = await getTokenInfo(params);

  const { symbol, timestamp } = { ...data };
  if (!(symbol && timestamp)) return;

  // {symbol}_{timestamp}
  const id = toCase(
    [symbol, moment(timestamp).utc().startOf('day').valueOf()].join('_'),
    'lower'
  );

  // index token info
  await write(TOKEN_INFO_COLLECTION, id, {
    id,
    ...data,
    granularity: getGranularity(timestamp),
  });

  return data;
};
