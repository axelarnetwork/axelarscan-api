require('dotenv').config();

const chai = require('chai');
const { expect } = { ...chai };

const { interchainStatsByTime } = require('../methods');

module.exports = () => {
  describe('interchainStatsByTime', () => {
    it('Should receive interchain stats by time data', async () => {
      const { data } = { ...(await interchainStatsByTime()) };

      data.forEach(d => {
        expect(d.num_txs).to.be.a('number');
      });
    }).timeout(30000);
  });
};
