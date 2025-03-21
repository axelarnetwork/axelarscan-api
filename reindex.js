/*********************************************
 * for manual run on local at specific block *
 * usage:                                    *
 *   node reindex.js -b {FROM_BLOCK_NUMBER}  *
 *********************************************/

require('dotenv').config();

const moment = require('moment');

const updateTokenInfo = require('./services/interval-update/updateTokenInfo');
const { ENVIRONMENT } = require('./utils/config');
const { sleep } = require('./utils/operator');
const { timeDiff } = require('./utils/time');
const { getBlockTimestamp } = require('../methods/axelar/utils');

// setup arguments
const { block } = { ...require('command-line-args')([{ name: 'block', alias: 'b', type: Number }]) };

const AVG_BLOCK_TIME = 7;
const BLOCK_PER_MINUTE = parseInt(60 / AVG_BLOCK_TIME);
const BLOCK_PER_HOUR = 60 * BLOCK_PER_MINUTE;
const BLOCK_PER_DAY = 24 * BLOCK_PER_HOUR;

const nextBlock = async (height, timestamp) => {
  const nextDay = moment(timestamp).add(1, 'days').endOf('hour').subtract(1, 'seconds');

  // +1 day
  height += BLOCK_PER_DAY;
  let nextTimestamp = await getBlockTimestamp(height);

  while (timeDiff(nextTimestamp, 'hours', nextDay) > 1) {
    // +1 hour
    height += BLOCK_PER_HOUR;
    nextTimestamp = await getBlockTimestamp(height);
  }

  for (const m of [30, 10, 5, 2, 1]) {
    while (timeDiff(nextTimestamp, 'minutes', nextDay, m === 1) > m) {
      // + m minute
      height += (m * BLOCK_PER_MINUTE);
      nextTimestamp = await getBlockTimestamp(height);
    }
  }

  return height;
};

const run = async () => {
  const fromBlock = block || {
    mainnet: 10734207,
    testnet: 11315731,
    stagenet: 2697615,
    'devnet-amplifier': 4863269,
  }[ENVIRONMENT];

  let height = fromBlock;

  while (true) {
    // update token info at specific height
    const { timestamp } = { ...await updateTokenInfo({ height }) };

    // log
    console.log({ height, timestamp, date: moment(timestamp).format() });

    // break when is today
    if (timeDiff(timestamp, 'hours') < 24) break;

    // next block
    height = await nextBlock(height, timestamp);

    // sleep before next round
    await sleep(2000);
  }
};

run();