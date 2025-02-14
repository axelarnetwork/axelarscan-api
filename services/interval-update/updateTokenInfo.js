const moment = require('moment');

const { getTokenInfo } = require('../../methods');
const { write } = require('../../services/indexer');
const { TOKEN_INFO_COLLECTION } = require('../../utils/config');
const { getGranularity } = require('../../utils/time');

module.exports = async params => {
  const data = await getTokenInfo(params);
  const { symbol, timestamp } = { ...data };
  if (!(symbol && timestamp)) return;

  const id = `${symbol}_${moment(timestamp).startOf('day').valueOf()}`.toLowerCase();
  await write(TOKEN_INFO_COLLECTION, id, { id, ...data, granularity: getGranularity(timestamp) });
};