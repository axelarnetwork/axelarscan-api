const _ = require('lodash');

const { toCase, split, toArray } = require('./parser');

const isString = string => typeof string === 'string';
const equalsIgnoreCase = (a, b) => (!a && !b) || toCase(a, 'lower') === toCase(b, 'lower');
const capitalize = string => !isString(string) ? '' : `${string.substr(0, 1).toUpperCase()}${string.substr(1)}`;
const camel = (string, delimiter = '_') => toArray(string, { delimiter }).map((s, i) => i > 0 ? capitalize(s) : s).join('');
const removeDoubleQuote = string => !isString(string) ? string : split(string, { delimiter: '"' }).join('');
const toBoolean = (string, defaultValue = true) => typeof string === 'boolean' ? string : !isString(string) ? defaultValue : equalsIgnoreCase(string, 'true');
const headString = (string, delimiter = '-') => _.head(split(string, { delimiter }));
const lastString = (string, delimiter = '-') => _.last(split(string, { delimiter }));
const find = (x, elements) => toArray(elements).find(e => equalsIgnoreCase(e, x));
const includesSomePatterns = (string, patterns) => toArray(patterns).findIndex(p => toArray(string).findIndex(s => s.includes(p)) > -1) > -1;

module.exports = {
  isString,
  equalsIgnoreCase,
  capitalize,
  camel,
  removeDoubleQuote,
  toBoolean,
  headString,
  lastString,
  find,
  includesSomePatterns,
};