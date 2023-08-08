const assert = require('chai').assert;
const ImportCommerceProduct = require('../lib/ImportCommerceProduct');

describe('Commerce Cloud Product Tests', () => {
  describe('Test request', () => {
    const importCom = new ImportCommerceProduct(
      {
        body: {
          data: '',
          mapping: {
            fieldMapping: {
              name: 'SKU',
              title: 'Product Name',
              category: 'Category'
            }
          }
        }
      },
      {}
    );

    it('Constructor Test', () => {
      assert.notEqual(
        importCom.fieldMapping,
        undefined,
        'Mapping Id was not added to this.mappingId');
    });
  });
});
