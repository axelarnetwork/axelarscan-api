const _ = require('lodash');
const moment = require('moment');

const { getLCDInstance } = require('../../utils');
const { getAssets, getAssetData } = require('../../../../utils/config');
const { request } = require('../../../../utils/http');
const { toArray } = require('../../../../utils/parser');
const { isString, lastString } = require('../../../../utils/string');
const { toNumber, formatUnits } = require('../../../../utils/number');

const PROPOSALS_PAGINATION_LIMIT = 50;

module.exports = async () => {
  const assetsData = await getAssets();

  let data = [];
  let nextKey = true;

  while (nextKey) {
    // get all proposals
    const { proposals, pagination } = {
      ...(await request(getLCDInstance(), {
        path: '/cosmos/gov/v1/proposals',
        params: {
          'pagination.limit': PROPOSALS_PAGINATION_LIMIT,
          'pagination.key': isString(nextKey) ? nextKey : undefined,
        },
      })),
    };

    data = _.orderBy(
      _.uniqBy(
        _.concat(
          data,
          await Promise.all(
            toArray(proposals).map(
              d =>
                new Promise(async resolve => {
                  // extract content from legacy wrapper if present (v1 response for old proposals)
                  const legacyMsg = toArray(d.messages).find(
                    m => m?.['@type'] === '/cosmos.gov.v1.MsgExecLegacyContent'
                  );
                  let content =
                    legacyMsg?.content || d.content || d.messages?.[0];

                  // for new v1 proposals, inject title/summary from proposal root into content
                  if (!legacyMsg && !d.content && d.title) {
                    content = {
                      ...content,
                      title: d.title,
                      description: d.summary,
                    };
                  }

                  // normalize
                  if (content) delete content.wasm_byte_code;

                  // handle both v1 (id) and v1beta1 (proposal_id)
                  d.proposal_id = toNumber(d.id || d.proposal_id);
                  d.type = lastString(content?.['@type'], '.')?.replace(
                    'Proposal',
                    ''
                  );

                  d.content = {
                    ...content,
                    plan: content?.plan && {
                      ...content.plan,
                      height: toNumber(content.plan.height),
                    },
                  };

                  d.status = d.status?.replace('PROPOSAL_STATUS_', '');
                  d.submit_time = moment(d.submit_time).valueOf();
                  d.deposit_end_time = moment(d.deposit_end_time).valueOf();
                  d.voting_start_time = moment(d.voting_start_time).valueOf();
                  d.voting_end_time = moment(d.voting_end_time).valueOf();

                  d.total_deposit = await Promise.all(
                    toArray(d.total_deposit).map(
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
                  );

                  // normalize tally result (v1 uses *_count, v1beta1 doesn't)
                  const tally = { ...d.final_tally_result };
                  d.final_tally_result = Object.fromEntries(
                    Object.entries({
                      yes: tally.yes_count || tally.yes,
                      abstain: tally.abstain_count || tally.abstain,
                      no: tally.no_count || tally.no,
                      no_with_veto:
                        tally.no_with_veto_count || tally.no_with_veto,
                    }).map(([k, v]) => [k, formatUnits(v, 6, false)])
                  );

                  resolve(d);
                })
            )
          )
        ),
        'proposal_id'
      ),
      ['proposal_id'],
      ['desc']
    );

    nextKey = pagination?.next_key;
  }

  return { data, total: data.length };
};
