const moment = require('moment');

const { log } = require('./logger');

const parseParams = (req, from) => {
  const { query, body } = { ...req };
  const method = req?.params?.method || body?.method || query?.method;
  const params = { ...query, ...body, method };
  // if (from) log('debug', from, 'receive request', { params });
  return params;
};

const parseError = error => ({ error: true, code: 400, message: error?.message });

const finalizeResponse = (response, params, startTime = moment()) => {
  const { method } = { ...params };
  // on error, add parameters to response
  if (response?.error) response = { ...response, method: response.method || method, params: response.params || params };
  // add time spent to response
  if (response && typeof response === 'object' && !Array.isArray(response) && !['getGMPDataMapping', 'getTransfersDataMapping'].includes(method)) {
    response = { ...response, time_spent: moment().diff(startTime) };
  }
  return response;
};

module.exports = {
  parseParams,
  parseError,
  finalizeResponse,
};
