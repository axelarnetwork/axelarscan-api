require('dotenv').config();

const chai = require('chai');
const { expect } = { ...chai };

const { getProposals } = require('../methods');

module.exports = () => {
  describe('getProposals', () => {
    it('Should receive list of proposals', async () => {
      const { data } = { ...await getProposals() };
      data.forEach(d => {
        expect(d).to.be.an('object');
        expect(d.proposal_id).to.be.a('number');
      });
    }).timeout(30000);
  });
};