const _ = require('lodash');
const moment = require('moment');

const getTotalSupply = require('./getTotalSupply');
const { getBlockTimestamp } = require('./utils');
const { getTVL } = require('../tvl');
const { ENVIRONMENT, getAssetData, getSupplyConfig } = require('../../utils/config');
const { toBoolean } = require('../../utils/string');
const { toFixed } = require('../../utils/number');
const { timeDiff } = require('../../utils/time');

const { max_supply, initial_unlocked_percent, community_sale, community_programs, company_operations, backers, team } = { ...getSupplyConfig() };

const calculateVesting = (config, assetData, timestamp = moment().valueOf()) => {
  const { total_unlock_percent, vesting_period, vesting_start, vesting_until } = { ...config };
  const { decimals } = { ...assetData };

  const total = parseFloat(toFixed(max_supply * total_unlock_percent / 100, decimals));
  const vestingStart = moment(vesting_start, 'YYYY-MM-DD').startOf('day').valueOf();
  const vestingUntil = moment(vesting_until, 'YYYY-MM-DD').startOf('day').valueOf();

  return {
    total,
    unlocked: timestamp >= vestingUntil ? total : // end
      timestamp <= vestingStart ? 0 : // before start
        // total * (vested time / total vesting time)
        parseFloat(toFixed(total * timeDiff(vestingStart, `${vesting_period}s`, timestamp) / timeDiff(vestingStart, `${vesting_period}s`, vestingUntil), decimals)),
    config,
  };
};

module.exports = async params => {
  const { height } = { ...params };
  let { symbol, debug } = { ...params };

  // default: AXL
  symbol = symbol || (ENVIRONMENT === 'devnet-amplifier' ? 'AMPLIFIER' : 'AXL');
  // default: false
  debug = toBoolean(debug, false);

  // get asset data
  const assetData = await getAssetData(symbol);
  const { denom, decimals } = { ...assetData };

  let circulatingSupply;

  switch (symbol) {
    case 'AXL':
    case 'AMPLIFIER':
      const totalSupply = await getTotalSupply({ asset: denom, height });
      const inflationRewards = totalSupply > max_supply ? parseFloat(toFixed(totalSupply - max_supply, decimals)) : 0;
      const initialUnlocked = parseFloat(toFixed(max_supply * initial_unlocked_percent / 100, decimals));

      // getBlockTimestamp when specific height
      const timestamp = height ? await getBlockTimestamp(height) : moment().valueOf();

      // vesting
      const communitySale = calculateVesting(community_sale, assetData, timestamp);
      const communityPrograms = calculateVesting(community_programs, assetData, timestamp);
      const companyOperations = calculateVesting(company_operations, assetData, timestamp);
      const _backers = calculateVesting(backers, assetData, timestamp);
      const _team = calculateVesting(team, assetData, timestamp);

      circulatingSupply = inflationRewards + initialUnlocked + communitySale?.unlocked + communityPrograms?.unlocked + companyOperations?.unlocked + _backers?.unlocked + _team?.unlocked;

      return !debug ? circulatingSupply : {
        circulating_supply: circulatingSupply,
        inflation_rewards: inflationRewards,
        initial_unlocked: initialUnlocked,
        community_sale: communitySale,
        community_programs: communityPrograms,
        company_operations: companyOperations,
        backers: _backers,
        team: _team,
      };
    default:
      if (denom) {
        // get TVL of this denom
        const response = await getTVL({ asset: denom });
        const { total, total_on_evm, total_on_cosmos } = { ..._.head(response?.data) };

        // is axelar asset
        const isAxelarAsset = symbol?.startsWith('axl');

        circulatingSupply = isAxelarAsset ? total_on_evm + total_on_cosmos : total;

        return !debug ? circulatingSupply : {
          symbol,
          circulating_supply: circulatingSupply,
          ...(isAxelarAsset ? { total_on_evm, total_on_cosmos } : { total }),
          ...response,
        };
      }
      return;
  }
};