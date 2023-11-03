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
            Value__c 
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
            Value__c 
        from Attribute_Value__c 
        where Attribute_Label__r.Name in (${attributeLabelNames}) and
        Digital_Asset__c in (${digitalAssetIds})`
      ));
    } catch(error) {
      this.log.addToLogs([{errors: [error] }], this.helper.namespace('Attribute_Value__c'))

      console.log(error)
    }
  }

  /** stores an Attribute Value as a { Id: Attribute_Value__c.Id, Value: Attribute_Value__c.Value__c } object
   * in a Map<Digital_Asset__c.Id, Map<Attribute_Label__r.Name, attribute value>>
   */
  sortAccordingToDigitalAssetAndLabel() {
    let assetLabelValueMap = new Map();
    let attrValueObject = new Object();

    this.attributes.records.forEach((attribute) => {
      attrValueObject['Id'] = attribute.Id;
      attrValueObject['Value'] = attribute.Value__c;
      console.log('attr: ', attrValueObject)
      if (assetLabelValueMap.has(attribute.Digital_Asset__c)) {
        assetLabelValueMap
          .get(attribute.Digital_Asset__c)
          .set(attribute.Attribute_Label__r.Name, attrValueObject);
      } else {
        assetLabelValueMap.set(
          attribute.Digital_Asset__c, 
          new Map([[attribute.Attribute_Label__r.Name, attrValueObject]]));
      }
    })

    return assetLabelValueMap;
  }
}

module.exports = PimAttributeValue
