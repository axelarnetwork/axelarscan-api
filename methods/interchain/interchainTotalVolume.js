const _ = require('lodash');

const { transfersTotalVolume } = require('./token-transfer');
const { GMPTotalVolume } = require('./gmp');
const { isNumber } = require('../../utils/number');

module.exports = async params => _.sum((
  await Promise.all(['transfers', 'gmp'].map(type => new Promise(async resolve => {
    let value;

    // get volume of each type
    switch (type) {
      case 'transfers':
        value = await transfersTotalVolume(params);
        break;
      case 'gmp':
        value = await GMPTotalVolume(params);
        break;
      default:
        value = 0;
        break;
    }

    resolve(value);
  })))
).filter(d => isNumber(d)));