const assert = require('chai').assert;
const PimAttributeTab = require('../service/PimAttributeTab');
const propelConnect = require('@propelsoftwaresolutions/propel-sfdc-connect');
const sinon = require('sinon');

const connection = propelConnect.newConnection('test.com', '123456');
const helper = propelConnect.newHelper(connection, {}, 'TEST', {});
const log = propelConnect.newLog(this.connection);

describe('PimAttributeTab tests', () => {
  describe('Build PimAttributeTab Object', () => {
    const pimAttributeTabObj = new PimAttributeTab(helper, log);

    it('constructor test', () => {
      assert.typeOf(pimAttributeTabObj.attributeTabs, 'array');
    });

    // it('populate test', () => {
    //   const queryCallout = sinon.stub(helper.connection, 'queryLimit')
    //     .returns(Promise.resolve([{'Id': '123456'}]));
    //   pimAttributeTabObj.populate();
    //   console.log(pimAttributeTabObj.attributeTabs);

    //   assert.equal(
    //     pimAttributeTabObj.attributeTabs.length > 0,
    //     'attributeTabs was not populated'
    //   );
    // });
  });
});
