require('dotenv').config();

const chai = require('chai');
const { expect } = { ...chai };

const { getTotalSupply } = require('../methods');

module.exports = () => {
  describe('getTotalSupply', () => {
    it('Should receive total supply', async () => {
      expect(await getTotalSupply()).to.be.a('number');
    }).timeout(30000);
  });
};
