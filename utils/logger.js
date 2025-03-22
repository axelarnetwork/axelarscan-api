const { toCase } = require('./parser');
const { isString } = require('./string');

const getLogLevel = () => process.env.LOG_LEVEL || 'debug';

const log = (level = 'info', from, message, data = {}) => {
  try {
    // normalize level
    level = toCase(level, 'lower');

    // generate log message {LEVEL} [{from}] {message}\n{data}
    const logMessage = `${level === 'error' ? 'ERR' : level === 'warn' ? 'WARN' : level === 'debug' ? 'DBG' : 'INF'} [${toCase(from, 'lower')}] ${message}\n${isString(data) ? data : typeof data === 'object' ? JSON.stringify(data, null, 2) : data}`;

    switch (level) {
      case 'error':
        console.error(logMessage);
        break;
      case 'warn':
        console.warn(logMessage);
        break;
      case 'debug':
        if (toCase(getLogLevel(), 'lower') === level) console.debug(logMessage);
        break;
      default:
        console.log(logMessage);
        break;
    }
  } catch (error) {}
};

module.exports = {
  log,
};