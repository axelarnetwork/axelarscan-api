const moment = require('moment');

const { getLCD } = require('../../utils/config');
const { createInstance, request } = require('../../utils/http');
const { sleep } = require('../../utils/operator');

const getBlockTimestamp = async height => {
  if (!height) return;

  while (true) {
    const { block } = { ...await request(getLCDInstance(height), { path: `/cosmos/base/tendermint/v1beta1/blocks/${height}` }) };
    const { time } = { ...block?.header };

    // return timestamp from response
    if (time) return moment(time).valueOf();

    await sleep(1000);
  }
};

const getLCDInstance = height => {
  // create lcd instance with headers when height is specified and using archive node
  const headers = height ? { 'x-cosmos-block-height': height } : undefined;
  return createInstance(getLCD(!!height), { gzip: true, headers });
};

module.exports = {
  getBlockTimestamp,
  getLCDInstance,
};