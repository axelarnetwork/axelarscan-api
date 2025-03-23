require('dotenv').config();

const chai = require('chai');
const { expect } = { ...chai };

const { interchainTotalFee } = require('../methods');

module.exports = () => {
  describe('interchainTotalFee', () => {
    it('Should receive interchain total fee', async () => {
      expect(await interchainTotalFee()).to.be.a('number');
    }).timeout(30000);
  });
};