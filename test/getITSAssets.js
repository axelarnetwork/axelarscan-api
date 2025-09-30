require('dotenv').config();

const chai = require('chai');
const { expect } = { ...chai };

const { getITSAssets } = require('../methods');

module.exports = () => {
  describe('getITSAssets', () => {
    it('Should receive list of its asset data', async () => {
      const response = await getITSAssets();

      response.forEach(d => {
        expect(d).to.be.an('object');
        expect(d.symbol).to.be.a('string');
        expect(d.decimals).to.be.a('number');
      });
    }).timeout(30000);
  });
};
