require('dotenv').config();

const chai = require('chai');
const { expect } = { ...chai };

const { searchTokenInfos } = require('../methods');

module.exports = () => {
  describe('searchTokenInfos', () => {
    it('Should receive token info data', async () => {
      const { data } = { ...await searchTokenInfos() };
      data.forEach(d => {
        expect(d.timestamp).to.be.a('number');
        expect(d.maxSupply).to.be.a('number');
        expect(d.totalBurned).to.be.a('number');
      });
    }).timeout(30000);
  });
};