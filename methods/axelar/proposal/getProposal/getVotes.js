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

          // if no .option, get it from .options
          if (!d.option && d.options?.length > 0) {
            // try to get the option with weight 1, or get the first one
            d.option = (
              d.options.find(o => o.weight === 1) || d.options[0]
            )?.option;
          } else {
            d.option = d.option?.replace('VOTE_OPTION_', '');
          }

          return d;
        })
      ),
      'voter'
    );

    nextKey = pagination?.next_key;
  }

  return { data, total: data.length };
};
