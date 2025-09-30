const { bech32 } = require('bech32');
const { tmhash } = require('tendermint/lib/hash');

const toHash = (string, length) => {
  try {
    return tmhash(string).slice(0, length).toString('hex').toUpperCase();
  } catch (error) {
    return null;
  }
};

const hexToBech32 = (address, prefix = 'axelar') => {
  try {
    return bech32.encode(prefix, bech32.toWords(Buffer.from(address, 'hex')));
  } catch (error) {
    return null;
  }
};

const bech32ToBech32 = (address, prefix) =>
  bech32.encode(prefix, bech32.decode(address).words);

const getBech32Address = (string, prefix = 'axelar', length = 20) =>
  hexToBech32(toHash(string, length), prefix);

const toJson = string => {
  if (!string) return null;
  if (typeof string === 'object') return string;
  try {
    return JSON.parse(string);
  } catch (error) {
    return null;
  }
};

const toCase = (string, _case = 'normal') => {
  if (typeof string !== 'string') return string;
  string = string.trim();
  switch (_case) {
    case 'upper':
      string = string.toUpperCase();
      break;
    case 'lower':
      string = string.toLowerCase();
      break;
    default:
      break;
  }
  return string;
};

const getOptions = options => {
  let { delimiter, toCase: _toCase, filterBlank } = { ...options };
  delimiter = typeof delimiter === 'string' ? delimiter : ',';
  _toCase = _toCase || 'normal';
  filterBlank = typeof filterBlank === 'boolean' ? filterBlank : true;
  return { ...options, delimiter, toCase: _toCase, filterBlank };
};

const split = (string, options) => {
  const {
    delimiter,
    toCase: _toCase,
    filterBlank,
  } = { ...getOptions(options) };
  return (
    typeof string !== 'string' && ![undefined, null].includes(string)
      ? [string]
      : (typeof string === 'string' ? string : '')
          .split(delimiter)
          .map(s => toCase(s, _toCase))
  ).filter(s => !filterBlank || s);
};

const toArray = (x, options) => {
  options = getOptions(options);
  const { toCase: _toCase, filterBlank } = { ...options };
  if (Array.isArray(x))
    return x.map(_x => toCase(_x, _toCase)).filter(_x => !filterBlank || _x);
  return split(x, options);
};

module.exports = {
  toHash,
  hexToBech32,
  bech32ToBech32,
  getBech32Address,
  toJson,
  toCase,
  split,
  toArray,
};
