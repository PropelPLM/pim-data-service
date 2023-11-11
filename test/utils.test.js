const assert = require('chai').assert;
const utils = require('../legacy/utils');
const sinon = require('sinon');

describe('Utils tests', () => {
  describe('parseDigitalAssetAttrVal', () => {
    let stub;
    const dummy_contentLocation = 'dummy_location';
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
          getValue: (asset, field) => {
            if (field == 'View_Link__c') {
              return dummy_link;
            }
            if (field == 'Content_Location__c') {
              return dummy_contentLocation;
            }
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
        sinon.assert.calledWith(stub, dummy_link, dummy_contentLocation, reqBody);
        assert.equal(daDownloadDetailsList.length, 1);
        assert.equal(parsed, dummy_link);
      });

      it('legit link', async () => {
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

  describe('prepareIdsForSOQL - enclose ids within quotes to be used in SOQL', () => {
    const idArray = ['dummy_id_1', 'dummy_id_2'];
    const idSet = new Set(idArray);

    it('array of ids', done => {
      const ids = utils.prepareIdsForSOQL(idArray).split(',');
      assert.equal(ids.length, 2);
      ids.forEach(id => assert.equal(id.substring(0, 1), "'"));
      done();
    });

    it('set of ids', done => {
      const ids = utils.prepareIdsForSOQL(idSet).split(',');
      assert.equal(ids.length, 2);
      ids.forEach(id => assert.equal(id.substring(0, 1), "'"));
      done();
    });
  });
});
