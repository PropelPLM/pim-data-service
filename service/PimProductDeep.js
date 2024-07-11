class PimProductDeep {

  /**
   * 
   * @param {PropelHelper} helper 
   * @param {PropelLog} log 
   * @param {Array(String)} productIds 
   */
  constructor(helper, log, productIds) {
    this.helper = helper
    this.log = log
    this.products = []
    this.productIds = productIds
  }

  async populate() {
    try {
      const results = await this.helper.connection.simpleQueryExtend(this.helper.namespaceQuery(
        `select Id, Name, Category__c, Category__r.Name,
          (
            select
                Id,
                Name,
                Attribute_Label__c,
                Attribute_Label__r.Attribute_Group__r.Name,
                Attribute_Label__r.Attribute_Group__r.Attribute_Tab__r.Name,
                Attribute_Label__r.Label__c,
                Attribute_Label__r.Mandatory__c,
                Attribute_Label__r.Primary_Key__c,
                Attribute_Label__r.Type__c,
                Overwritten_Variant_Value__c,
                Overwritten_Variant_Value__r.Label__c,
                Overwritten_Variant_Value__r.Name,
                Overwritten_Variant_Value__r.Parent_Value_Path__c,
                Value__c,
                Value_Long__c,
                Numeric_Value__c
            from Attributes__r
            order by Attribute_Label__r.Order__c asc
          ),
          (
            select
                Id,
                Name,
                Attribute_Group__r.Attribute_Tab__c
            from Attribute_Group_Links__r
          ),
          (
            select
                Id,
                Name,
                Order__c
            from Variants__r
          )
        from Product__c
        where Id IN (${this.helper.connection.QUERY_LIST})`
      ), this.productIds)

      this.products = results[0].records

    } catch(error) {
      this.log.addToLogs([{errors: [error] }], this.helper.namespace('Product__c'))

      console.log(error)
    }
  }

  /**
   * @returns Product Array of Product objects
   */
  getProducts() {
    return this.products
  }

  getProductNameMap() {
    const returnMap = new Map()

    this.products.forEach(product => {
      // first set the product objects in the map
      returnMap.set(product.Name, product.Attributes__r?.records.filter(attribute => {
        if (attribute['Overwritten_Variant_Value__c'] == null) {
          return attribute
        }
      }))

      // next set all the overwrites in the map
      product.Attributes__r.records.forEach(attribute => {
        if (attribute['Overwritten_Variant_Value__c']) {
          if (returnMap.has(attribute['Overwritten_Variant_Value__r'].Name)) {
            returnMap.get(attribute['Overwritten_Variant_Value__r'].Name).push(attribute)
          } else {
            returnMap.set(attribute['Overwritten_Variant_Value__r'].Name, [attribute])
          }
        }
      })
    })

    return new Map([...returnMap.entries()].sort())
  }
}

module.exports = PimProductDeep
