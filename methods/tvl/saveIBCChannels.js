const _ = require('lodash');
const moment = require('moment');

const { getLCDInstance } = require('../axelar/utils');
const { read, write } = require('../../services/indexer');
const { IBC_CHANNEL_COLLECTION, getChainData } = require('../../utils/config');
const { request } = require('../../utils/http');
const { getBech32Address, toArray } = require('../../utils/parser');
const { isString } = require('../../utils/string');
const { isNumber, toNumber } = require('../../utils/number');
const { timeDiff } = require('../../utils/time');

module.exports = async () => {
  let allChannels;
  let nextKey = true;

  while (nextKey) {
    // get all IBC channels
    const { channels, pagination } = { ...await request(getLCDInstance(), { path: '/ibc/core/channel/v1/channels', params: isString(nextKey) ? { 'pagination.key': nextKey } : undefined }) };

    // merge channels and uniq by channel_id
    allChannels = _.uniqBy(toArray(_.concat(allChannels, channels)), 'channel_id');

    nextKey = pagination?.next_key;
  }

  // query all channels
  const { data } = { ...await read(IBC_CHANNEL_COLLECTION, { match_all: {} }, { size: 1000 }) };

  // merge data from indexer and lcd results
  allChannels = toArray(allChannels).map(d => ({
    ...toArray(data).find(c => c.channel_id === d.channel_id),
    ...d,
  }));

  if (data) {
    await Promise.all(allChannels.map(channel => new Promise(async resolve => {
      const { channel_id, port_id, version, counterparty, updated_at } = { ...channel };
      let { chain_id, escrow_address } = { ...channel };

      if (!chain_id || !escrow_address || (counterparty && !counterparty.escrow_address) || timeDiff(updated_at * 1000, 'minutes') > 240) {
        // get channel state
        const response = await request(getLCDInstance(), { path: `/ibc/core/channel/v1/channels/${channel_id}/ports/${port_id}/client_state` });

        const { client_state } = { ...response?.identified_client_state };

        // set chain_id from client_state
        chain_id = client_state?.chain_id || chain_id;

        if (chain_id) {
          // set escrow address of this channel
          escrow_address = getBech32Address(`${version}\x00${port_id}/${channel_id}`) || escrow_address;

          const { prefix_address } = { ...getChainData(chain_id, 'cosmos') };

          if (counterparty && prefix_address) {
            // set escrow address of counterparty channel
            counterparty.escrow_address = getBech32Address(`${version}\x00${counterparty.port_id}/${counterparty.channel_id}`, prefix_address);
          }

          // index channel
          await write(IBC_CHANNEL_COLLECTION, channel_id, {
            ...channel,
            chain_id,
            counterparty,
            escrow_address,
            latest_height: isNumber(client_state?.latest_height?.revision_height) ? toNumber(client_state.latest_height.revision_height) : undefined,
            updated_at: moment().unix(),
          }, false, false);
        }
      }

      resolve();
    })));
  }
};