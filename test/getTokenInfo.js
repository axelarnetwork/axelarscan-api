require('dotenv').config();

const chai = require('chai');
const { expect } = { ...chai };

const { getTokenInfo } = require('../methods');
const { ENVIRONMENT } = require('../utils/config');

module.exports = () => {
  describe('getTokenInfo', () => {
    it('Should receive token info', async () => {
      const response = await getTokenInfo();

      expect(response).to.be.an('object');
      expect(response.circulatingSupply).to.be.a('number');

      if (ENVIRONMENT === 'mainnet') {
        // upbit
        let response = await getTokenInfo({ agent: 'upbit' });

        expect(response).to.be.an('array');
        expect(response).to.have.lengthOf.at.least(1);

        response.forEach(d => {
          expect(d).to.be.an('object');
          expect(d.currencyCode).to.be.a('string');
          expect(d.circulatingSupply).to.be.a('number');
        });

        // axelar wrapped asset
        response = await getTokenInfo({ symbol: 'axlUSDC' });

        expect(response).to.be.an('object');
        expect(response.circulatingSupply).to.be.a('number');
      }
    }).timeout(100000);
  });
};