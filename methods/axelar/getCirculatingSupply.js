const _ = require('lodash');
const moment = require('moment');

const getTotalSupply = require('./getTotalSupply');
const { getTVL } = require('../tvl');
const { ENVIRONMENT, getAssetData, getLCD, getSupplyConfig } = require('../../utils/config');
const { createInstance, request } = require('../../utils/http');
const { toBoolean } = require('../../utils/string');
const { toFixed } = require('../../utils/number');
const { timeDiff } = require('../../utils/time');

const { max_supply, initial_unlocked_percent, community_sale, community_programs, company_operations, backers, team } = { ...getSupplyConfig() };

const calculateVesting = (config, assetData, until) => {
  const { total_unlock_percent, vesting_period, vesting_start, vesting_until } = { ...config };
  const { decimals } = { ...assetData };
  const total = parseFloat(toFixed(max_supply * total_unlock_percent / 100, decimals));
  const current = moment().valueOf();
  const vestingStart = moment(vesting_start, 'YYYY-MM-DD').startOf('day').valueOf();
  const vestingUntil = until || moment(vesting_until, 'YYYY-MM-DD').startOf('day').valueOf();
  return { total, unlocked: current >= vestingUntil ? total : current <= vestingStart ? 0 : parseFloat(toFixed(total * timeDiff(vestingStart, `${vesting_period}s`) / timeDiff(vestingStart, `${vesting_period}s`, vestingUntil), decimals)), config };
};

module.exports = async params => {
  const { height } = { ...params };
  let { symbol, debug } = { ...params };
  symbol = symbol || 'AXL';
  debug = toBoolean(debug, false);

  const assetData = await getAssetData(symbol);
  const { denom, decimals } = { ...assetData };

  let circulating_supply;
  switch (symbol) {
    case 'AXL':
      const totalSupply = await getTotalSupply({ asset: denom, height });
      const inflationRewards = totalSupply > max_supply ? parseFloat(toFixed(totalSupply - max_supply, decimals)) : 0;
      const initialUnlocked = parseFloat(toFixed(max_supply * initial_unlocked_percent / 100, decimals));

      const headers = height ? { 'x-cosmos-block-height': height } : undefined;
      const instance = createInstance(getLCD(ENVIRONMENT, !!height), { gzip: true, headers });

      let timestamp;
      if (height) {
        const { block } = { ...await request(instance, { path: `/cosmos/base/tendermint/v1beta1/blocks/${height}` }) };
        const { time } = { ...block?.header };
        if (time) timestamp = moment(time).valueOf();
      }

      const communitySale = calculateVesting(community_sale, assetData, timestamp);
      const communityPrograms = calculateVesting(community_programs, assetData, timestamp);
      const companyOperations = calculateVesting(company_operations, assetData, timestamp);
      const _backers = calculateVesting(backers, assetData, timestamp);
      const _team = calculateVesting(team, assetData, timestamp);

      circulating_supply = inflationRewards + initialUnlocked + communitySale?.unlocked + communityPrograms?.unlocked + companyOperations?.unlocked + _backers?.unlocked + _team?.unlocked;
      return !debug ? circulating_supply : { circulating_supply, inflation_rewards: inflationRewards, initial_unlocked: initialUnlocked, community_sale: communitySale, community_programs: communityPrograms, company_operations: companyOperations, backers: _backers, team: _team };
    default:
      if (denom) {
        const response = await getTVL({ asset: denom });
        const { total, total_on_evm, total_on_cosmos } = { ..._.head(response?.data) };
        const isNative = !symbol?.startsWith('axl');

        circulating_supply = isNative ? total : total_on_evm + total_on_cosmos;
        return !debug ? circulating_supply : { symbol, circulating_supply, ...(isNative ? { total } : { total_on_evm, total_on_cosmos }), ...response };
      }
      return;
  }
};