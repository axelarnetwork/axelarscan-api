require('dotenv').config();

const chai = require('chai');
const { expect } = { ...chai };

const { getAccountAmounts } = require('../methods');
const { ENVIRONMENT } = require('../utils/config');

module.exports = () => {
  describe('getAccountAmounts', () => {
    it('Should receive axelar account\'s amount data', async () => {
      const { balances, delegations, redelegations, unbondings, rewards, commissions } = { ...await getAccountAmounts({ address: ENVIRONMENT === 'mainnet' ? 'axelar1zh9wrak6ke4n6fclj5e8yk397czv430yg3zhs3' : 'axelar1ymq2mtjcgy7nh2qy8rcnyfd95kuwayxtwzw8jt' }) };

      balances.data.forEach(d => {
        expect(d.amount).to.be.a('number');
      });

      delegations.data.forEach(d => {
        expect(d.amount).to.be.a('number');
      });

      redelegations.data.forEach(d => {
        expect(d.amount).to.be.a('number');
      });

      unbondings.data.forEach(d => {
        expect(d.amount).to.be.a('number');
      });

      rewards.rewards.forEach(d => {
        expect(d.amount).to.be.a('number');
      });

      commissions.forEach(d => {
        expect(d.amount).to.be.a('number');
      });
    }).timeout(30000);
  });
};