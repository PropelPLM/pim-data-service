class PimAttributeValueByParent {

  /**
   * @param {PropelHelper} helper
   * @param {PropelLog} log
   * @param {Array(String)} parentName
   */
  constructor(helper, log, parentName) {
    this.attributeValues = []
    this.helper = helper
    this.log = log
    this.parentName = parentName
  }

  async populate() {
    try {
      const valueStrings = this.parentName.join(',')
      this.attributeValues = await this.helper.connection.queryLimit(this.helper.namespaceQuery(
        `select
          Id,
          Attribute_Label__r.Primary_Key__c,
          Digital_Asset__r.Name,
          Overwritten_Variant_Value__r.Name,
          Product__r.Name,
          Value__c,
          Value_Long__c,
          Numeric_Value__c
        from Attribute_Value__c
        where
          Digital_Asset__r.Name in (${valueStrings}) OR
          Product__r.Name in (${valueStrings}) OR
          Overwritten_Variant_Value__r.Name in (${valueStrings})`
      ))
    } catch(error) {
      this.log.addToLogs([{errors: [error] }], this.helper.namespace('Attribute_Value__c'))
      console.log(error)
    }
  }

  getNameMap() {
    const returnMap = new Map()
    let keyStr
    this.attributeValues.forEach(attribute => {
      if (attribute[this.helper.parentNamespace('Overwritten_Variant_Value__r.Name')]) {
        keyStr =
          attribute[this.helper.parentNamespace('Overwritten_Variant_Value__r.Name')] +
          '' +
          attribute[this.helper.parentNamespace('Attribute_Label__r.Primary_Key__c')]
      } else if (attribute[this.helper.parentNamespace('Digital_Asset__r.Name')]) {
        keyStr =
          attribute[this.helper.parentNamespace('Digital_Asset__r.Name')] +
          '' +
          attribute[this.helper.parentNamespace('Attribute_Label__r.Primary_Key__c')]
      } else {
        keyStr =
          attribute[this.helper.parentNamespace('Product__r.Name')] +
          '' +
          attribute[this.helper.parentNamespace('Attribute_Label__r.Primary_Key__c')]
      }
      returnMap.set(
        keyStr,
        attribute.Id
      )
    })
    return returnMap
  }
}

module.exports = PimAttributeValueByParent
