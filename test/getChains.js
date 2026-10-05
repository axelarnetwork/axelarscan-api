require('dotenv').config();

const chai = require('chai');
const { expect } = { ...chai };

const { getChains } = require('../methods');

module.exports = () => {
  describe('getChains', () => {
    it('Should receive list of chain data', async () => {
      const response = await getChains();

      response.forEach(d => {
        expect(d).to.be.an('object');
        expect(d.id).to.be.a('string');
      });
    });
  });
};
