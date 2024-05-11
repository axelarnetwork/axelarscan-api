require('dotenv').config();

const chai = require('chai');
const { expect } = { ...chai };

const { getTVL } = require('../methods');

module.exports = () => {
  describe('getTVL', () => {
    it('Should receive tvl data', async () => {
      const { data } = { ...await getTVL({ asset: 'uaxl', force_update: true }) };
      expect(data).to.be.an('array');
      data.forEach(d => {
        expect(d.tvl).to.be.an('object');
        expect(d.total).to.be.a('number');
      });
    }).timeout(300000);
  });
};