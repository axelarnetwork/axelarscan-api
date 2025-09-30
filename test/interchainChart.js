require('dotenv').config();

const chai = require('chai');
const { expect } = { ...chai };

const { interchainChart } = require('../methods');

module.exports = () => {
  describe('interchainChart', () => {
    it('Should receive interchain chart data', async () => {
      const { data } = { ...(await interchainChart()) };

      data.forEach(d => {
        expect(d.num_txs).to.be.a('number');
      });
    }).timeout(30000);
  });
};
