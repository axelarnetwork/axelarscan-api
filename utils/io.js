const moment = require('moment');

const parseParams = req => {
  const { query, body } = { ...req };
  const method = req?.params?.method || body?.method || query?.method;
  return { ...query, ...body, method };
};

const parseError = error => ({ error: true, code: 400, message: error?.message });

const finalizeResponse = (response, params, startTime = moment()) => {
  // on error, add parameters to response
  if (response?.error) response = { ...response, method: response.method || params.method, params: response.params || params };

  // add time spent to response
  if (response && typeof response === 'object' && !Array.isArray(response) && !['getGMPDataMapping', 'getTransfersDataMapping'].includes(params.method)) {
    response = { ...response, time_spent: moment().diff(startTime) };
  }

  return response;
};

module.exports = {
  parseParams,
  parseError,
  finalizeResponse,
};