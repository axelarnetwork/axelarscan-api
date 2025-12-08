const _ = require('lodash');

const { getChainData } = require('../config');
const { createInstance, request } = require('../http');
const { toArray } = require('../parser');
const { isString, equalsIgnoreCase } = require('../string');
const { isNumber, formatUnits } = require('../number');

/**
 * Shared utility to handle Cosmos SDK v0.50+ query parameter conversion and fallback.
 * Tries query= first (> v0.50), falls back to events= (< v0.50) if needed.
 *
 * @param {string} path - The request path
 * @param {object} params - The request parameters
 * @param {function} requestFn - Function to make the request: (path, params) => Promise<response>
 */
const queryWithFallback = async (path, params, requestFn) => {
  if (!path || !requestFn) return;

  // Convert events to query for Cosmos SDK v0.50+ compatibility
  const workingParams = { ...(params || {}) };
  let workingPath = path;

  if (workingParams.events && !workingParams.query) {
    workingParams.query = workingParams.events;
    delete workingParams.events;
  }
  if (workingPath.includes('events=') && !workingPath.includes('query=')) {
    workingPath = workingPath.replace(/\bevents=/g, 'query=');
  }

  // Try with query= first (new Cosmos SDK v0.50+)
  let response = await requestFn(workingPath, workingParams);

  // If 'query' fails with a specific error, try with 'events' (older Cosmos SDK versions)
  if (
    (response?.error || !response) &&
    (workingParams.query || workingPath.includes('query=')) &&
    !workingParams.events
  ) {
    // Check if error suggests endpoint expects 'events' parameter (old SDK)
    const errorMessage =
      response?.error?.message || response?.error?.error?.message || '';
    const errorCode = response?.error?.code || response?.error?.error?.code;
    const isOldSDKError =
      errorMessage.toLowerCase().includes('event') &&
      errorMessage.toLowerCase().includes('invalid request') &&
      errorCode === 3;

    // Only fallback if it looks like an old SDK endpoint error, not a temporary failure
    if (isOldSDKError) {
      const fallbackParams = { ...workingParams };
      if (fallbackParams.query) {
        fallbackParams.events = fallbackParams.query;
        delete fallbackParams.query;
      }

      let fallbackPath = workingPath;
      if (fallbackPath.includes('query=')) {
        fallbackPath = fallbackPath.replace(/\bquery=/g, 'events=');
      }

      response = await requestFn(fallbackPath, fallbackParams);
    }
  }

  return response;
};

const getLCDs = (chain, nLCDs, timeout) => {
  const { deprecated, endpoints } = { ...getChainData(chain, 'cosmos') };
  const lcds = toArray(endpoints?.lcd);

  if (lcds.length > 0 && !deprecated) {
    return {
      query: async (path, params) => {
        if (!path) return;

        timeout = timeout || endpoints.timeout?.lcd;

        for (const lcd of _.slice(lcds, 0, nLCDs || lcds.length)) {
          try {
            const instance = createInstance(lcd, { timeout, gzip: true });
            const requestFn = async (reqPath, reqParams) => {
              return await request(instance, {
                path: reqPath,
                params: reqParams,
              });
            };

            const response = await queryWithFallback(path, params, requestFn);

            // has response without error
            if (response && !response.error) {
              return response;
            }
          } catch (error) {}
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

  for (const denom of denoms) {
    try {
      const response = await lcds.query(
        `/cosmos/bank/v1beta1/balances/${address}/by_denom`,
        { denom }
      );
      const { amount } = { ...response?.balance };
      balance = amount;

      if (balance) {
        break;
      }
    } catch (error) {}
  }

  return formatUnits(balance, decimals || 6, false);
};

const getIBCSupply = async (chain, contractData) => {
  const lcds = getLCDs(chain, 3, 5000);
  const { ibc_denom, decimals } = { ...contractData };
  if (!(lcds && ibc_denom)) return;

  let supply;
  let valid = false;
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

  return valid ? formatUnits(supply, decimals || 6, false) : undefined;
};

module.exports = {
  getLCDs,
  getCosmosBalance,
  getIBCSupply,
  queryWithFallback,
};
