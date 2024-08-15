class PimAttributeValue {

  /**
   * @param {PropelHelper} helper
   * @param {PropelLog} log
   * @param {Array(String)} productNames
   */
  constructor(helper, log, productNames) {
    this.attributes = []
    this.helper = helper
    this.log = log
    this.productNames = productNames
  }

  async populate() {
    try {
      this.attributes = await this.helper.connection.queryExtend(this.helper.namespaceQuery(
        `select
            Id,
            Attribute_Label__r.Primary_Key__c,
            Overwritten_Variant_Value__r.Name,
            Product__r.Name,
            Value__c,
            Value_Long__c,
            Numeric_Value__c
        from Attribute_Value__c
        where Product__r.Name in (${this.helper.connection.QUERY_LIST})`
      ), this.productNames)
    } catch(error) {
      this.log.addToLogs([{errors: [error] }], this.helper.namespace('Attribute_Value__c'))

      console.log(error)
    }
  }

  getNameMap() {
    const returnMap = new Map()

    this.attributes.forEach(attribute => {
      if (attribute[this.helper.parentNamespace('Overwritten_Variant_Value__r.Name')]) {
        let myKey =
          attribute[this.helper.parentNamespace('Overwritten_Variant_Value__r.Name')] +
          '' +
          attribute[this.helper.parentNamespace('Attribute_Label__r.Primary_Key__c')]
        returnMap.set(
          myKey,
          attribute
        )
      } else {
        let myOtherKey =
          attribute[this.helper.parentNamespace('Product__r.Name')] +
          '' +
          attribute[this.helper.parentNamespace('Attribute_Label__r.Primary_Key__c')]
        returnMap.set(
          myOtherKey,
          attribute
        )
      }
    })
    return returnMap
  }

  async populateWithDigitalAssetValues(digitalAssetIds, attributeLabelNames) {
    try {
      this.attributes = await this.helper.connection.simpleQuery(this.helper.namespaceQuery(
        `select
            Id,
            Attribute_Label__r.Name,
            Digital_Asset__c,
            Value__c,
            Value_Long__c,
            Numeric_Value__c
        from Attribute_Value__c
        where Attribute_Label__r.Name in (${attributeLabelNames}) and
        Digital_Asset__c in (${digitalAssetIds})`
      ));
    } catch(error) {
      this.log.addToLogs([{errors: [error] }], this.helper.namespace('Attribute_Value__c'))

      console.log(error)
    }
  }

  /** stores Attribute Values in a Map<Digital_Asset__c.Id, Map<Attribute_Label__r.Name, Attribute_Value__c.Id>>
   */
  sortAccordingToDigitalAssetAndLabel() {
    let assetLabelValueMap = new Map();

    this.attributes.records.forEach((attribute) => {
      let attributeLabelName = this.helper.getNestedField(attribute, this.helper.parentNamespace('Attribute_Label__r.Name'))
      if (!attributeLabelName) { // attributeLabelName === undefined
        console.error('attribute.Attribute_Label__r.Name is undefined')
        // skip if value has no label linked
        return;
      }
      let parentAssetId = attribute[this.helper.namespace('Digital_Asset__c')]
      if (assetLabelValueMap.has(parentAssetId)) {
        assetLabelValueMap
          .get(parentAssetId)
          .set(attributeLabelName, attribute.Id);
      } else {
        assetLabelValueMap.set(
          parentAssetId,
          new Map([[attributeLabelName, attribute.Id]]));
      }
    });

    return assetLabelValueMap;
  }
}

module.exports = PimAttributeValue
