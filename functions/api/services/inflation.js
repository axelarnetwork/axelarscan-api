const config = require('config-yml');
const lcd = require('./lcd');
const cli = require('./cli');
const {
  to_json,
} = require('../utils');

const environment = process.env.ENVIRONMENT || config?.environment;

const evm_chains_data = require('../data')?.chains?.[environment]?.evm || [];

module.exports = async (
  params = {},
) => {
  let response;

  const numEVMChains = evm_chains_data.length;

  response = await lcd(
    '/cosmos/mint/v1beta1/inflation',
  );

  const tendermintInflationRate = response ?
    Number(response.inflation) :
    null;

  response = await cli(
    null,
    {
      cmd: 'axelard q params subspace reward KeyMgmtRelativeInflationRate -oj',
    },
  );

  const keyMgmtRelativeInflationRate = Number(
    (
      {
        ...to_json(response?.stdout),
      }.value ||
      ''
    )
    .split('"')
    .join('')
  );

  response = await cli(
    null,
    {
      cmd: 'axelard q params subspace reward ExternalChainVotingInflationRate -oj',
    },
  );

  const externalChainVotingInflationRate = Number(
    (
      {
        ...to_json(response?.stdout),
      }.value ||
      ''
    )
    .split('"')
    .join('')
  );

  const inflation =
    (
      tendermintInflationRate *
      keyMgmtRelativeInflationRate
    ) +
    (
      externalChainVotingInflationRate *
      numEVMChains
    );

  return {
    equation: 'inflation = (tendermintInflationRate * keyMgmtRelativeInflationRate) + (externalChainVotingInflationRate * numEVMChains)',
    tendermintInflationRate,
    keyMgmtRelativeInflationRate,
    externalChainVotingInflationRate,
    numEVMChains,
    inflation,
  }
};