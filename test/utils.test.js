const assert = require('chai').assert;
const utils = require('../legacy/utils');
const sinon = require('sinon');

describe('Utils tests', () => {
  describe('parseDigitalAssetAttrVal', () => {
    let stub;
    const dummy_link = 'dummy_link';
    const attrValValue = 'dummy_attr_val';
    const invalidAttrValValue = 'invalid_dummy_attr_val';
    const digitalAssetMap = new Map();
    const daDownloadDetailsList = [];

    beforeEach(() => {
      stub = sinon.stub(utils, 'prependCDNToViewLink').returns(dummy_link);
      sinon.spy(stub);
    });

    afterEach(() => {
      stub.restore();
      daDownloadDetailsList.length = 0;
      digitalAssetMap.clear();
    });

    it('null DA parsing', async () => {
      const parsed = await utils.parseDigitalAssetAttrVal(
        digitalAssetMap,
        invalidAttrValValue,
        daDownloadDetailsList
      );

      sinon.assert.notCalled(stub);
      assert.equal(daDownloadDetailsList.length, 0);
      assert.equal(parsed, invalidAttrValValue);
    });

    describe('view_link behaviour', () => {
      const asset = 'dummy_asset';
      const reqBody = { namespace: 'dummy_namespace' };

      beforeEach(() => {
        digitalAssetMap.set(attrValValue, asset);
      });

      it('not a legit link', async () => {
        const helper = {
          getValue: () => {
            return dummy_link;
          }
        };
        const parsed = await utils.parseDigitalAssetAttrVal(
          digitalAssetMap,
          attrValValue,
          daDownloadDetailsList,
          helper,
          reqBody
        );
        sinon.assert.calledOnce(stub);
        sinon.assert.calledWith(stub, dummy_link, reqBody);
        assert.equal(daDownloadDetailsList.length, 1);
        assert.equal(parsed, dummy_link);
      });

      it('a legit link', async () => {
        const helper = {
          getValue: () => {
            return `https${dummy_link}`;
          }
        };
        const parsed = await utils.parseDigitalAssetAttrVal(
          digitalAssetMap,
          attrValValue,
          daDownloadDetailsList,
          helper,
          reqBody
        );
        sinon.assert.notCalled(stub);
        assert.equal(daDownloadDetailsList.length, 1);
        assert.equal(parsed, `https${dummy_link}`);
      });
    });
  });
});
