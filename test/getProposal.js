require('dotenv').config();

const chai = require('chai');
const { expect } = { ...chai };

const { getProposal } = require('../methods');

module.exports = () => {
  describe('getProposal', () => {
    it('Should receive proposal data', async () => {
      const id = 1;
      const { proposal_id } = { ...await getProposal({ id }) };

      expect(proposal_id).to.equal(id);
    }).timeout(30000);
  });
};