const { TOKEN_API, PRO_TOKEN_API } = require('./config');
const { request } = require('./http');
const { log } = require('./logger');
const { getCoingeckoApiKey } = require('./secrets');

/**
 * Send a GET request to the CoinGecko API
 * Uses the Pro API with the configured API key, otherwise the keyless public API
 * @param {object} options - request options (path, params)
 * @returns {Promise<object>} The response data, or { error } on failure
 */
const requestTokenAPI = async options => {
  const apiKey = await getCoingeckoApiKey();

  const response = await request(apiKey ? PRO_TOKEN_API : TOKEN_API, {
    ...options,
    headers: apiKey ? { 'x-cg-pro-api-key': apiKey } : undefined,
  });

  if (response?.error) {
    log('warn', 'coingecko', 'coingecko request failed', {
      path: options?.path,
      error: response.error,
    });
  }

  return response;
};

module.exports = {
  requestTokenAPI,
};
