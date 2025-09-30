const generateQuery = require('./generateQuery');
const generateReadParams = require('./generateReadParams');
const search = require('./search');
const { TOKEN_INFO_COLLECTION } = require('../../../utils/config');

module.exports = async params => {
  const query = await generateQuery(params);
  const readParams = generateReadParams(params);
  return await search(TOKEN_INFO_COLLECTION, query, readParams);
};
