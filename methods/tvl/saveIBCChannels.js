const _ = require('lodash');
const moment = require('moment');

const { read, write } = require('../../services/indexer');
const { IBC_CHANNEL_COLLECTION, getChainData, getLCD } = require('../../utils/config');
const { createInstance, request } = require('../../utils/http');
const { getAddress, toArray } = require('../../utils/parser');
const { timeDiff } = require('../../utils/time');

module.exports = async () => {
  let allChannels;
  let nextKey = true;
  while (nextKey) {
    const { channels, pagination } = { ...await request(createInstance(getLCD(), { gzip: true }), { path: '/ibc/core/channel/v1/channels', params: nextKey && typeof nextKey !== 'boolean' ? { 'pagination.key': nextKey } : undefined }) };
    allChannels = _.uniqBy(toArray(_.concat(allChannels, channels)), 'channel_id');
    nextKey = pagination?.next_key;
  }

  const { data } = { ...await read(IBC_CHANNEL_COLLECTION, { match_all: {} }, { size: 1000 }) };
  allChannels = toArray(allChannels).map(d => { return { ...toArray(data).find(_d => _d.channel_id === d.channel_id), ...d }; });

  await Promise.all(allChannels.map(channel => new Promise(async resolve => {
    const { channel_id, port_id, version, counterparty, updated_at } = { ...channel };
    let { chain_id, escrow_address } = { ...channel };

    if (!chain_id || !escrow_address || (counterparty && !counterparty.escrow_address) || timeDiff(updated_at * 1000, 'minutes') > 240) {
      const response = await request(createInstance(getLCD(), { gzip: true }), { path: `/ibc/core/channel/v1/channels/${channel_id}/ports/${port_id}/client_state` });
      const { client_state } = { ...response?.identified_client_state };
      chain_id = client_state?.chain_id || chain_id;

      if (chain_id) {
        escrow_address = getAddress(`${version}\x00${port_id}/${channel_id}`) || escrow_address;
        const { prefix_address } = { ...getChainData(chain_id, 'cosmos') };
        if (counterparty && prefix_address) counterparty.escrow_address = getAddress(`${version}\x00${counterparty.port_id}/${counterparty.channel_id}`, prefix_address);
        await write(IBC_CHANNEL_COLLECTION, channel_id, { ...channel, chain_id, counterparty, escrow_address, updated_at: moment().unix() }, false, false);
      }
    }
    resolve();
  })));
};