const _ = require('lodash');

const { transfersTotalFee } = require('./token-transfer');
const { GMPTotalFee } = require('./gmp');
const { isNumber } = require('../../utils/number');

module.exports = async params => _.sum((
  await Promise.all(['transfers', 'gmp'].map(type => new Promise(async resolve => {
    let value;

    // get total fees of each type
    switch (type) {
      case 'transfers':
        value = await transfersTotalFee(params);
        break;
      case 'gmp':
        value = await GMPTotalFee(params);
        break;
      default:
        value = 0;
        break;
    }

    resolve(value);
  })))
).filter(d => isNumber(d)));