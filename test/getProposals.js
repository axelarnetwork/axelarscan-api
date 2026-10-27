require('dotenv').config();

const chai = require('chai');
const { expect } = { ...chai };

const { getProposals } = require('../methods');

module.exports = () => {
  describe('getProposals', () => {
    it('Should receive list of proposals', async () => {
      const { data } = { ...(await getProposals()) };

      data.forEach(d => {
        expect(d).to.be.an('object');
        expect(d.proposal_id).to.be.a('number');
        expect(JSON.stringify(d)).to.not.match(/"wasm_byte_code":/);

        if (/StoreCode|StoreAndInstantiate/.test(d.type)) {
          expect(d.content.wasm_byte_code_checksum).to.match(/^[0-9a-f]{64}$/);
          expect(d.content.wasm_byte_code_size).to.be.a('number');
        }
      });
    }).timeout(60000);
  });
};
