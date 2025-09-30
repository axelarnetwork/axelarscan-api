require('dotenv').config();

const chai = require('chai');
const { expect } = { ...chai };

const { getInflation } = require('../methods');

module.exports = () => {
  describe('getInflation', () => {
    it('Should receive inflation', async () => {
      const { inflation } = { ...(await getInflation()) };

      expect(inflation).to.be.a('number');
    }).timeout(30000);
  });
};
