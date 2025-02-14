const { read } = require('../../../services/indexer');
const { sleep } = require('../../../utils/operator');

module.exports = async (collection, query, params, options) => {
  const { delay_ms } = { ...options };
  await sleep(delay_ms);
  return await read(collection, query, params);
};