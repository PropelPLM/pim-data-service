const assert = require('chai').assert;
const ImportCommerceProduct = require('../lib/ImportCommerceProduct');

describe('Commerce Cloud Product Tests', () => {
  describe('Test request', () => {
    const importCom = new ImportCommerceProduct(
      {
        body: {
          data: '',
          mappingId: 'test_id'
        }
      },
      {}
    );

    it('Constructor Test', () => {
      assert.equal(importCom.mappingId, 'test_id', 'Mapping Id was not added to this.mappingId');
    });
  });
});
