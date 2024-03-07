const assert = require('chai').assert;
const ImportCommerceProduct = require('../lib/ImportCommerceProduct');

describe('Commerce Cloud Product Tests', () => {
  describe('Test request', () => {
    const importCom = new ImportCommerceProduct(
      {
        body: {
          alternateCategoryId: "a09DC000001yJXkYAM",
          data: '',
          mapping: {
            name: 'SKU',
            title: 'Product Name',
            category: 'Category'
          },
          options: {
            attribute_set: "Color_Size",
            catalog: "0ZSDC000000Gs1e4AC",
            cms_workspace: "0ZuDC000000LBc00AG",
            entitlement: "1CeDC000000GrrS0AS",
            pricebook_id: "01sDC000001bLYuYAM",
            pricebook_name: "Coffee and more Price Book",
            webstoreId: "0ZEDC000000Gs2B4AS"
          },
          pimProductId: "a0FDC000004ubJX2AY",
          skipDB: true,
          user: "test-00wfnpqokipd@example.com"
        }
      }
    );

    it('Constructor Test', () => {
      assert.notEqual(
        importCom.mapping,
        undefined,
        'Mapping Id was not added to this.mappingId');
    });
  });
});
