/*********************************************
 * for manual run on local at specific block *
 * usage:                                    *
 *   node reindex.js -b {FROM_BLOCK_NUMBER}  *
 *********************************************/

require('dotenv').config();

const moment = require('moment');

const updateTokenInfo = require('./services/interval-update/updateTokenInfo');
const { ENVIRONMENT, getLCD } = require('./utils/config');
const { createInstance, request } = require('./utils/http');
const { sleep } = require('./utils/operator');
const { timeDiff } = require('./utils/time');

// setup arguments
const { block } = { ...require('command-line-args')([{ name: 'block', alias: 'b', type: Number }]) };

const AVG_BLOCK_TIME = 7;
const BLOCK_PER_MINUTE = parseInt(60 / AVG_BLOCK_TIME);
const BLOCK_PER_HOUR = 60 * BLOCK_PER_MINUTE;
const BLOCK_PER_DAY = 24 * BLOCK_PER_HOUR;

const getBlockTimestamp = async height => {
  if (!height) return;
  const instance = createInstance(getLCD(ENVIRONMENT, true), { gzip: true });
  while (true) {
    const { block } = { ...await request(instance, { path: `/cosmos/base/tendermint/v1beta1/blocks/${height}` }) };
    const { time } = { ...block?.header };
    if (time) return moment(time).valueOf();
    await sleep(1000);
  }
};

const nextBlock = async (height, timestamp) => {
  height += BLOCK_PER_DAY;
  const nextDay = moment(timestamp).add(1, 'days').endOf('hour').subtract(1, 'seconds');

  let nextTimestamp = await getBlockTimestamp(height);
  while (timeDiff(nextTimestamp, 'hours', nextDay) > 1) {
    height += BLOCK_PER_HOUR;
    nextTimestamp = await getBlockTimestamp(height);
  }

  for (const m of [30, 10, 5, 2, 1]) {
    while (timeDiff(nextTimestamp, 'minutes', nextDay, m === 1) > m) {
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
    const { timestamp } = { ...await updateTokenInfo({ height }) };
    console.log({ height, timestamp, date: moment(timestamp).format() });
    if (timeDiff(timestamp, 'hours') < 24) break;
    height = await nextBlock(height, timestamp);
    await sleep(2000);
  }
};

run();