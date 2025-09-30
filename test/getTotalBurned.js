require('dotenv').config();

const chai = require('chai');
const { expect } = { ...chai };

const { getTotalBurned } = require('../methods');

module.exports = () => {
  describe('getTotalBurned', () => {
    it('Should receive total burned', async () => {
      expect(await getTotalBurned()).to.be.a('number');
    }).timeout(30000);
  });
};
