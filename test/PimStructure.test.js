const assert = require('chai').assert;
const PimStructure = require('../legacy/PimStructure');

const basicHeader = 'Record_ID,Description';
const basicFields = 'PROPEL_ATT(“ProductID”),PROPEL_ATT(“Description”)';
const basicTemplatedExportCSVString = `${basicHeader}\r\n${basicFields}`;

const misconfiguredFields = 'PROPEL_ATT(“ProductID”),“Description”';
const misconfiguredTemplatedExportCSVString = `${basicHeader}\r\n${misconfiguredFields}`;

describe('PimStructure tests', () => {
  describe('getTemplateHeadersAndFields', () => {
    it('basic get template header and fields', done => {
      const { templateHeaders, templateFields } =
        new PimStructure().getTemplateHeadersAndFields(
          basicTemplatedExportCSVString
        );

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
      const { templateFields } = new PimStructure().getTemplateHeadersAndFields(
        misconfiguredTemplatedExportCSVString
      );

      // note that fields without PROPEL_ATT flag will be considered as raw values - which are valid fields and
      // the expected behavior is that for every row in that column, the cell's value is the raw value
      assert.equal(templateFields.length, 2);
      done();
    });
  });
});
