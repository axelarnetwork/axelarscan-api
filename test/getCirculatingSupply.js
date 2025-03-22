require('dotenv').config();

const chai = require('chai');
const { expect } = { ...chai };

const { getCirculatingSupply } = require('../methods');
const { ENVIRONMENT } = require('../utils/config');

module.exports = () => {
  describe('getCirculatingSupply', () => {
    it('Should receive circulating supply', async () => {
      expect(await getCirculatingSupply()).to.be.a('number');

      if (ENVIRONMENT === 'mainnet') {
        expect(await getCirculatingSupply({ symbol: 'axlUSDC' })).to.be.a('number');
      }
    }).timeout(30000);
  });
};