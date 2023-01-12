const assert = require('chai').assert;
const PimStructure = require('../legacy/PimStructure');

const basicHeader = 'Product_ID,Description';
const basicFields = 'PROPEL_ATT(“ProductID”),PROPEL_ATT(“Description”)';
const basicTemplatedExportCSVString = `${basicHeader}\r\n${basicFields}`;

const misconfiguredFields = 'PROPEL_ATT(“ProductID”),“Description”';
const misconfiguredTemplatedExportCSVString = `${basicHeader}\r\n${misconfiguredFields}`;

describe('PimStructure tests', () => {
  describe('getTemplateHeadersAndFields', () => {
    it('basic get template header and fields', done => {
      const { templateHeaders, templateFields } =
        PimStructure.getTemplateHeadersAndFields(basicTemplatedExportCSVString);

      // array checks
      assert.typeOf(templateHeaders, 'array');
      assert.typeOf(templateFields, 'array');
      assert.equal(templateHeaders.length, 2);
      assert.equal(templateFields.length, 2);

      // value checks
      assert.equal(templateHeaders, basicHeader);
      assert.notEqual(templateFields, basicFields);

      done();
    });

    it('misconfigured fields', done => {
      const { templateFields } = PimStructure.getTemplateHeadersAndFields(
        misconfiguredTemplatedExportCSVString
      );

      // array checks
      assert.equal(templateFields.length, 1);
      done();
    });
  });
});
