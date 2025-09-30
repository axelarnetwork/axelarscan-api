require('dotenv').config();

const chai = require('chai');
const { expect } = { ...chai };
const madge = require('madge');

module.exports = () => {
  describe('circularImport', () => {
    it('Should not get circular import error', async () =>
      expect((await madge('index.js')).circular()).to.have.lengthOf(0)).timeout(
      10000
    );
  });
};
