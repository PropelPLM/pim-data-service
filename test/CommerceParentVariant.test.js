const CommerceParentVariant = require('../service/CommerceParentVariant');
const PropelHelperMock = require('../test_data/PropelHelperMock');
const assert = require('chai').assert;

describe('Commerce Parent Variant Tests', () => {
  describe('Build data - no namespace', () => {
    const helperMock = new PropelHelperMock();
    const commerceParentV = new CommerceParentVariant(
      helperMock,
      'testProductId',
      'testAltCatId',
      'mapping',
      {},
      {}
    );

    it('Testing namespacePlus', () => {
      assert.equal(
        commerceParentV.namespacePlus('test1.test2'),
        'test1.test2',
        'Failure: namespacePlus returned something wrong when testing without a namesapce'
      );
    });
  });

  describe('Build data - with namespace', () => {
    const helperMock = new PropelHelperMock();
    helperMock.namespaceString = 'PIM';
    const commerceParentV = new CommerceParentVariant(
      helperMock,
      'testProductId',
      'testAltCatId',
      'mapping',
      {},
      {}
    );

    it('Testing namespacePlus with namespaece', () => {
      assert.equal(
        commerceParentV.namespacePlus('test1.test2'),
        'PIM__test1.PIM__test2',
        'Failure: namespacePlus returned something wrong when testing with a namesapce'
      );
    });
  });
});
