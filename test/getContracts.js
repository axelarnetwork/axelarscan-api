require('dotenv').config();

const chai = require('chai');
const { expect } = { ...chai };

const { getContracts } = require('../methods');

module.exports = () => {
  describe('getContracts', () => {
    it('Should receive gateway and gas service contracts', async () => {
      const { gateway_contracts, gas_service_contracts } = { ...await getContracts() };

      expect(gateway_contracts).to.be.an('object');
      expect(gas_service_contracts).to.be.an('object');
    }).timeout(30000);;
  });
};