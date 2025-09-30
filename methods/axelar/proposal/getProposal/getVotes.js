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
        path: `/cosmos/gov/v1beta1/proposals/${id}/votes`,
        params: { 'pagination.key': isString(nextKey) ? nextKey : undefined },
      })),
    };

    data = _.uniqBy(
      _.concat(
        data,
        toArray(votes).map(d => {
          // normalize
          d.proposal_id = toNumber(d.proposal_id);
          d.option = d.option?.replace('VOTE_OPTION_', '');

          d.options = toArray(d.options).map(d => ({
            ...d,
            option: d.option?.replace('VOTE_OPTION_', ''),
            weight: toNumber(d.weight),
          }));

          return d;
        })
      ),
      'voter'
    );

    nextKey = pagination?.next_key;
  }

  return { data, total: data.length };
};
