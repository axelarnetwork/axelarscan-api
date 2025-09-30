const moment = require('moment');

const getGranularity = timestamp => {
  const time = moment(timestamp).utc();
  return {
    ms: time.valueOf(),
    ...Object.fromEntries(
      ['hour', 'day', 'week', 'month', 'quarter', 'year'].map(x => [
        x,
        moment(time).startOf(x).valueOf(),
      ])
    ),
  };
};

const timeDiff = (
  fromTime = moment().subtract(5, 'minutes'),
  unit = 'seconds',
  toTime = moment(),
  exact = false
) => moment(toTime).diff(moment(fromTime), unit, exact);

module.exports = {
  getGranularity,
  timeDiff,
};
