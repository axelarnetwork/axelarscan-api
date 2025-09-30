require('dotenv').config();

const chai = require('chai');
const { expect } = { ...chai };

const { getTVLAlert } = require('../methods');

module.exports = () => {
  describe('getTVLAlert', () => {
    it('Should receive tvl alert status', async () => {
      const response = await getTVLAlert();

      expect(response).to.be.an('object');
      expect(response.timestamp).to.be.a('string');
      expect(response.native_on_evm_total_status).to.be.a('string');
    }).timeout(30000);
  });
};
