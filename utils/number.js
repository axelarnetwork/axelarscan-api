const { FixedNumber, isHexString, formatUnits: _formatUnits, parseUnits: _parseUnits } = require('ethers');

const { split } = require('./parser');
const { isString, headString } = require('./string');

const isNumber = number => typeof number === 'number' || (isString(number) && number && !isNaN(number));
const toNumber = number => isNumber(number) ? Number(number) : 0;

const toBigNumber = number => {
  try {
    return number.round(0).toString().replace('.0', '');
  } catch (error) {
    return headString((isHexString(number?.hex) ? BigInt(number.hex) : isHexString(number) ? BigInt(number) : number)?.toString(), '.') || '0';
  }
};

const toFixedNumber = number => FixedNumber.fromString(number?.toString().includes('.') ? number.toString() : toBigNumber(number));

const formatUnits = (number = '0', decimals = 18, parseNumber = true) => {
  const formattedNumber = _formatUnits(toBigNumber(number), decimals);
  return parseNumber ? toNumber(formattedNumber) : formattedNumber;
};

const parseUnits = (number = 0, decimals = 18) => {
  try {
    number = number.toString();

    if (number.includes('.')) {
      const [_number, _decimals] = split(number, { delimiter: '.' });

      if (isString(_decimals) && _decimals.length > decimals) {
        // decimals fixed
        let output = `${_number}${_decimals.substring(0, decimals)}`;
        // remove prefix 0
        while (output.length > 1 && output.startsWith('0')) output = output.substring(1);
        return output;
      }
    }

    return toBigNumber(_parseUnits(number, decimals));
  } catch (error) {
    return '0';
  }
};

const toFixed = (number = 0, decimals = 18) => toNumber(number).toFixed(decimals);

module.exports = {
  isNumber,
  toNumber,
  toBigNumber,
  toFixedNumber,
  formatUnits,
  parseUnits,
  toFixed,
};