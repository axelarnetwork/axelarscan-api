require('dotenv').config();

const chai = require('chai');
const { expect } = { ...chai };

const { interchainTotalActiveUsers } = require('../methods');

module.exports = () => {
  describe('interchainTotalActiveUsers', () => {
    it('Should receive interchain total active users', async () => {
      expect(await interchainTotalActiveUsers()).to.be.a('number');
    }).timeout(30000);
  });
};