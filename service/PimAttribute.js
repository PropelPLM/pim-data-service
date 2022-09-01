class PimAttribute {

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
}

module.exports = PimAttribute
