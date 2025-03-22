require('dotenv').config();

const chai = require('chai');
const { expect } = { ...chai };

const { getNetworkParameters } = require('../methods');

module.exports = () => {
  describe('getNetworkParameters', () => {
    it('Should receive network parameters', async () => {
      const { stakingParams, bankSupply, stakingPool, slashingParams } = { ...await getNetworkParameters() };

      expect(stakingParams).to.be.an('object');
      expect(bankSupply).to.be.an('object');
      expect(stakingPool).to.be.an('object');
      expect(slashingParams).to.be.an('object');
    }).timeout(30000);
  });
};