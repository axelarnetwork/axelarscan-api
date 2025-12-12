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
  const { proposal } = {
    ...(await request(getLCDInstance(), {
      path: `/cosmos/gov/v1/proposals/${id}`,
    })),
  };

  // extract content from legacy wrapper if present (v1 response for old proposals)
  const legacyMsg = toArray(proposal?.messages).find(
    m => m?.['@type'] === '/cosmos.gov.v1.MsgExecLegacyContent'
  );
  let content =
    legacyMsg?.content || proposal?.content || proposal?.messages?.[0];

  // for new v1 proposals, inject title/summary from proposal root into content
  if (!legacyMsg && !proposal?.content && proposal?.title) {
    content = {
      ...content,
      title: proposal.title,
      description: proposal.summary,
    };
  }

  const {
    id: proposalId,
    proposal_id,
    status,
    submit_time,
    deposit_end_time,
    voting_start_time,
    voting_end_time,
    total_deposit,
    final_tally_result,
  } = { ...proposal };
  const { plan } = { ...content };
  const { height } = { ...plan };

  // get votes of this proposal
  const { data } = { ...(await getVotes(params)) };

  // get assets data
  const assetsData = proposal ? await getAssets() : undefined;

  // normalize tally result (v1 uses *_count, v1beta1 doesn't)
  const tally = { ...final_tally_result };
  const normalizedTally = {
    yes: tally.yes_count || tally.yes,
    abstain: tally.abstain_count || tally.abstain,
    no: tally.no_count || tally.no,
    no_with_veto: tally.no_with_veto_count || tally.no_with_veto,
  };

  return {
    proposal_id: toNumber(proposalId || proposal_id),
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
    total_deposit: await Promise.all(
      toArray(total_deposit).map(
        d =>
          new Promise(async resolve => {
            // get asset data of the deposit asset
            const { symbol, decimals } = {
              ...(await getAssetData(d.denom, assetsData)),
            };

            resolve({
              ...d,
              symbol,
              amount: formatUnits(d.amount, decimals || 6, false),
            });
          })
      )
    ),
    final_tally_result: Object.fromEntries(
      Object.entries(normalizedTally).map(([k, v]) => [
        k,
        formatUnits(v, 6, false),
      ])
    ),
    votes: toArray(data),
  };
};
