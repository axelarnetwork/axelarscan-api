const moment = require('moment');

const getVotes = require('./getVotes');
const { getLCDInstance } = require('../../utils');
const { getAssets, getAssetData } = require('../../../../utils/config');
const { request } = require('../../../../utils/http');
const { toArray } = require('../../../../utils/parser');
const { lastString } = require('../../../../utils/string');
const { toNumber, formatUnits } = require('../../../../utils/number');

module.exports = async params => {
  const { id } = { ...params };
  if (!id) return;

  // get proposal data
  const { proposal } = { ...await request(getLCDInstance(), { path: `/cosmos/gov/v1beta1/proposals/${id}` }) };

  const { proposal_id, content, status, submit_time, deposit_end_time, voting_start_time, voting_end_time, total_deposit, final_tally_result } = { ...proposal };
  const { plan } = { ...content };
  const { height } = { ...plan };

  // get votes of this proposal
  const { data } = { ...await getVotes(params) };

  // get assets data
  const assetsData = proposal ? await getAssets() : undefined;

  return {
    proposal_id: toNumber(proposal_id),
    type: lastString(content?.['@type'], '.')?.replace('Proposal', ''),
    content: {
      ...content,
      plan: plan && { ...plan, height: toNumber(height) },
    },
    status: status?.replace('PROPOSAL_STATUS_', ''),
    submit_time: moment(submit_time).valueOf(),
    deposit_end_time: moment(deposit_end_time).valueOf(),
    voting_start_time: moment(voting_start_time).valueOf(),
    voting_end_time: moment(voting_end_time).valueOf(),
    total_deposit: await Promise.all(toArray(total_deposit).map(d => new Promise(async resolve => {
      // get asset data of the deposit asset
      const { symbol, decimals } = { ...await getAssetData(d.denom, assetsData) };

      resolve({
        ...d,
        symbol,
        amount: formatUnits(d.amount, decimals || 6, false),
      });
    }))),
    final_tally_result: Object.fromEntries(Object.entries({ ...final_tally_result }).map(([k, v]) => [k, formatUnits(v, 6, false)])),
    votes: toArray(data),
  };
};