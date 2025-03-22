require('dotenv').config();

const chai = require('chai');
const { expect } = { ...chai };

const { getAssets } = require('../methods');

module.exports = () => {
  describe('getAssets', () => {
    it('Should receive list of asset data', async () => {
      const response = await getAssets();

      response.forEach(d => {
        expect(d).to.be.an('object');
        expect(d.id).to.equal(d.denom);
      });
    }).timeout(30000);
  });
};