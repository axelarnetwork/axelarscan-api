const METHODS = require('../../methods');
const { getAxelarS3Config } = require('../../utils/config');

module.exports = async () => {
  await Promise.all(['getAxelarS3Config'].map(d => new Promise(async resolve => {
    switch (d) {
      case 'getAxelarS3Config':
        resolve(await getAxelarS3Config(undefined, true));
        break;
      default:
        resolve(await METHODS[d]());
        break;
    }
  })));
};