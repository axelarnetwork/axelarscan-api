require('dotenv').config();

const chai = require('chai');
const { expect } = { ...chai };

const { interchainTotalVolume } = require('../methods');

module.exports = () => {
  describe('interchainTotalVolume', () => {
    it('Should receive interchain total volume', async () => {
      expect(await interchainTotalVolume()).to.be.a('number');
    }).timeout(30000);
  });
};