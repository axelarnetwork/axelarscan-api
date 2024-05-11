const _ = require('lodash');

const { getChainData } = require('../config');
const { createInstance, request } = require('../http');
const { toArray } = require('../parser');
const { equalsIgnoreCase } = require('../string');
const { isNumber, formatUnits } = require('../number');

const getLCDs = (chain, numLCDs, timeout) => {
  const { deprecated, endpoints } = { ...getChainData(chain, 'cosmos') };
  const lcds = toArray(endpoints?.lcd);
  if (lcds.length > 0 && !deprecated) {
    try {
      return {
        query: async (path = '', params = {}) => {
          let output;
          if (path) {
            for (const lcd of _.slice(lcds, 0, numLCDs && numLCDs < lcds.length ? numLCDs : lcds.length)) {
              const response = await request(createInstance(lcd, { timeout: timeout || endpoints?.timeout?.lcd, gzip: true }), { path, params });
              const { error } = { ...response };
              if (response && !error) {
                output = response;
                break;
              }
            }
          }
          return output;
        },
      };
    } catch (error) {}
  }
  return null;
};

const getCosmosBalance = async (chain, address, denomData) => {
  const lcds = getLCDs(chain, 3);
  const { denom, ibc_denom, decimals } = { ...denomData };
  const denoms = toArray([denom, ibc_denom]);
  if (!(lcds && address)) return null;

  let balance;
  let valid = false;
  for (const denom of denoms) {
    for (const path of ['/cosmos/bank/v1beta1/balances/{address}/by_denom', '/cosmos/bank/v1beta1/balances/{address}/{denom}']) {
      try {
        const response = await lcds.query(path.replace('{address}', address).replace('{denom}', encodeURIComponent(denom)), { denom });
        const { amount } = { ...response?.balance };
        balance = amount;
        if (balance) {
          valid = true;
          break;
        }
      } catch (error) {}
    }
    if (valid) break;
  }
  return formatUnits(balance, decimals || 6, false);
};

const getIBCSupply = async (chain, denomData) => {
  const lcds = getLCDs(chain, 3, 5000);
  const { ibc_denom, decimals } = { ...denomData };
  if (!(lcds && ibc_denom)) return null;

  let supply;
  let valid = false;
  if (!ibc_denom.includes('ibc/')) {
    const response = await lcds.query(`/cosmos/bank/v1beta1/supply/${encodeURIComponent(ibc_denom)}`);
    const { amount } = { ...response?.amount };
    supply = amount;
    valid = !!(supply && supply !== '0');
  }

  if (!valid) {
    let responsive = false;
    let supplies = [];
    let nextKey = true;
    while (nextKey) {
      const response = await lcds.query('/cosmos/bank/v1beta1/supply', { 'pagination.limit': 3000, 'pagination.key': nextKey && typeof nextKey !== 'boolean' ? nextKey : undefined });
      responsive = responsive || !!response?.supply;
      supplies = _.concat(supplies, toArray(response?.supply));
      nextKey = response?.pagination?.next_key;
    }

    supply = supplies.find(d => equalsIgnoreCase(d.denom, ibc_denom))?.amount;
    if (!(supply && supply !== '0') && responsive) supply = '0';
    valid = isNumber(supply);
  }
  return valid ? formatUnits(supply, decimals || 6, false) : null;
};

module.exports = {
  getLCDs,
  getCosmosBalance,
  getIBCSupply,
};