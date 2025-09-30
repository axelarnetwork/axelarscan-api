const _ = require('lodash');

const { getChainData } = require('../config');
const { createInstance, request } = require('../http');
const { toArray } = require('../parser');
const { isString, equalsIgnoreCase } = require('../string');
const { isNumber, formatUnits } = require('../number');

const getLCDs = (chain, nLCDs, timeout) => {
  const { deprecated, endpoints } = { ...getChainData(chain, 'cosmos') };
  const lcds = toArray(endpoints?.lcd);

  if (lcds.length > 0 && !deprecated) {
    return {
      query: async (path, params) => {
        if (path) {
          timeout = timeout || endpoints.timeout?.lcd;

          for (const lcd of _.slice(lcds, 0, nLCDs || lcds.length)) {
            try {
              const response = await request(
                createInstance(lcd, { timeout, gzip: true }),
                { path, params }
              );

              // has response without error
              if (response && !response.error) {
                return response;
              }
            } catch (error) {}
          }
        }
        return;
      },
    };
  }

  return;
};

const getCosmosBalance = async (chain, address, contractData) => {
  const lcds = getLCDs(chain, 3);
  if (!(lcds && address)) return;

  const { denom, ibc_denom, decimals } = { ...contractData };
  const denoms = toArray([denom, ibc_denom]);

  let balance;
  let valid = false;

  for (const denom of denoms) {
    for (const path of [
      '/cosmos/bank/v1beta1/balances/{address}/by_denom',
      '/cosmos/bank/v1beta1/balances/{address}/{denom}',
    ]) {
      try {
        const response = await lcds.query(
          path
            .replace('{address}', address)
            .replace('{denom}', encodeURIComponent(denom)),
          { denom }
        );
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

const getIBCSupply = async (chain, contractData) => {
  const lcds = getLCDs(chain, 3, 5000);
  const { ibc_denom, decimals } = { ...contractData };
  if (!(lcds && ibc_denom)) return;

  let supply;
  let valid = false;

  // get supply by request /supply/{denom}
  if (!ibc_denom.includes('ibc/')) {
    const { amount } = {
      ...(await lcds.query(
        `/cosmos/bank/v1beta1/supply/${encodeURIComponent(ibc_denom)}`
      )),
    };

    supply = amount?.amount;
    valid = isNumber(supply) && supply !== '0';
  }

  if (!valid) {
    let responsive = false;
    let nextKey = true;

    while (nextKey) {
      // get supply by /supply
      const response = await lcds.query('/cosmos/bank/v1beta1/supply', {
        'pagination.limit': 3000,
        'pagination.key': isString(nextKey) ? nextKey : undefined,
      });

      // find amount of this denom from response
      supply = toArray(response?.supply).find(d =>
        equalsIgnoreCase(d.denom, ibc_denom)
      )?.amount;

      nextKey = response?.pagination?.next_key;

      // set responsive = true when supply is number or got response of last page
      responsive = isNumber(supply) || (!!response?.supply && !nextKey);

      // break when already got supply
      if (nextKey && isNumber(supply)) break;
    }

    if (!(isNumber(supply) && supply !== '0') && responsive) {
      // set 0 when denom isn't exists
      supply = '0';
    }

    valid = isNumber(supply);
  }

  return valid ? formatUnits(supply, decimals || 6, false) : undefined;
};

module.exports = {
  getLCDs,
  getCosmosBalance,
  getIBCSupply,
};
