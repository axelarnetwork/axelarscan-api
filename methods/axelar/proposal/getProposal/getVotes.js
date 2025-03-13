const _ = require('lodash');

const { getLCD } = require('../../../../utils/config');
const { createInstance, request } = require('../../../../utils/http');
const { toArray } = require('../../../../utils/parser');
const { toNumber } = require('../../../../utils/number');

module.exports = async params => {
  const { id } = { ...params };
  if (!id) return;

  let data = [];
  let nextKey = true;
  while (nextKey) {
    const { votes, pagination } = { ...await request(createInstance(getLCD(), { gzip: true }), { path: `/cosmos/gov/v1beta1/proposals/${id}/votes`, params: { 'pagination.key': nextKey && typeof nextKey !== 'boolean' ? nextKey : undefined } }) };
    data = _.uniqBy(_.concat(toArray(data), toArray(votes).map(d => {
      d.proposal_id = toNumber(d.proposal_id);
      d.option = d.option?.replace('VOTE_OPTION_', '');
      d.options = toArray(d.options).map(d => ({ ...d, option: d.option?.replace('VOTE_OPTION_', ''), weight: toNumber(d.weight) }));
      return d;
    })), 'voter');
    nextKey = pagination?.next_key;
  }
  return { data, total: data.length };
};