const _ = require('lodash');

const { transfersTotalActiveUsers } = require('./token-transfer');
const { GMPTotalActiveUsers } = require('./gmp');
const { isNumber } = require('../../utils/number');

module.exports = async params => _.sum((
  await Promise.all(['transfers', 'gmp'].map(type => new Promise(async resolve => {
    let value;

    // get total active users of each type
    switch (type) {
      case 'transfers':
        value = await transfersTotalActiveUsers(params);
        break;
      case 'gmp':
        value = await GMPTotalActiveUsers(params);
        break;
      default:
        value = 0;
        break;
    }

    resolve(value);
  })))
).filter(d => isNumber(d)));