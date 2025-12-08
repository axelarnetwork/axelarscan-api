const _ = require('lodash');

const { getLCDInstance } = require('../../utils');
const { request } = require('../../../../utils/http');
const { toArray } = require('../../../../utils/parser');
const { isString } = require('../../../../utils/string');
const { toNumber } = require('../../../../utils/number');

module.exports = async params => {
  const { id } = { ...params };
  if (!id) return;

  let data = [];
  let nextKey = true;

  while (nextKey) {
    // get votes of this proposal
    const { votes, pagination } = {
      ...(await request(getLCDInstance(), {
        path: `/cosmos/gov/v1/proposals/${id}/votes`,
        params: { 'pagination.key': isString(nextKey) ? nextKey : undefined },
      })),
    };

    data = _.uniqBy(
      _.concat(
        data,
        toArray(votes).map(d => {
          // normalize
          d.proposal_id = toNumber(d.proposal_id);

          d.options = toArray(d.options).map(d => ({
            ...d,
            option: d.option?.replace('VOTE_OPTION_', ''),
            weight: toNumber(d.weight),
          }));

          const normalizedOption = d.option?.replace('VOTE_OPTION_', '');
          const fallbackOption =
            d.options?.length > 0
              ? (d.options.find(o => o.weight === 1) || d.options[0])?.option
              : undefined;

          // use the explicitly provided option if available, otherwise fall back
          d.option = normalizedOption || fallbackOption;

          return d;
        })
      ),
      'voter'
    );

    nextKey = pagination?.next_key;
  }

  return { data, total: data.length };
};
