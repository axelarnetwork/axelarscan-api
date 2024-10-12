const _ = require('lodash');
const moment = require('moment');

const { getAssetsList, getAssetData, getLCD } = require('../../../../utils/config');
const { createInstance, request } = require('../../../../utils/http');
const { toArray } = require('../../../../utils/parser');
const { lastString } = require('../../../../utils/string');
const { toNumber, formatUnits } = require('../../../../utils/number');

module.exports = async () => {
  const assetsData = await getAssetsList();
  let data = [];
  let nextKey = true;
  while (nextKey) {
    const { proposals, pagination } = { ...await request(createInstance(getLCD(), { gzip: true }), { path: '/cosmos/gov/v1beta1/proposals', params: { 'pagination.key': nextKey && typeof nextKey !== 'boolean' ? nextKey : undefined } }) };
    data = _.orderBy(_.uniqBy(_.concat(toArray(data), await Promise.all(toArray(proposals).map(d => new Promise(async resolve => {
      if (d.content) delete d.content.wasm_byte_code;
      d.proposal_id = toNumber(d.proposal_id);
      d.type = lastString(d.content?.['@type'], '.')?.replace('Proposal', '');
      d.content = { ...d.content, plan: d.content?.plan && { ...d.content.plan, height: toNumber(d.content.plan.height) } };
      d.status = d.status?.replace('PROPOSAL_STATUS_', '');
      d.submit_time = moment(d.submit_time).valueOf();
      d.deposit_end_time = moment(d.deposit_end_time).valueOf();
      d.voting_start_time = moment(d.voting_start_time).valueOf();
      d.voting_end_time = moment(d.voting_end_time).valueOf();
      d.total_deposit = await Promise.all(toArray(d.total_deposit).map(d => new Promise(async resolve => {
        const { symbol, decimals } = { ...await getAssetData(d.denom, assetsData) };
        resolve({ ...d, symbol, amount: formatUnits(d.amount, decimals || 6, false) });
      })));
      d.final_tally_result = Object.fromEntries(Object.entries({ ...d.final_tally_result }).map(([k, v]) => [k, formatUnits(v, 6, false)]));
      resolve(d);
    })))), 'proposal_id'), ['proposal_id'], ['desc']);
    nextKey = pagination?.next_key;
  }
  return { data, total: data.length };
};