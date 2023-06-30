class PimProduct {

  /**
   * @param {PropelHelper} helper
   * @param {PropelLog} log
   * @param {Array} productNames
   */
  constructor(helper, log, productNames, skipVariant) {
    this.helper = helper
    this.log = log
    this.products = []
    this.productIdName = {}
    this.productVariantMap = new Map()
    this.productNames = productNames
    this.skipVariant = skipVariant
  }

  async populate() {
    try {
      this.products = await this.helper.connection.queryExtend(this.helper.namespaceQuery(
        `select Id, Name from Product__c where Name in (${this.helper.connection.QUERY_LIST})`
      ), this.productNames)

      for (let product of this.products) {
        this.productIdName[product.Id] = product.Name
      }
      if (!this.skipVariant) {
        this.productVariants = await this.helper.connection.queryExtend(this.helper.namespaceQuery(
          `select Id, Name, Order__c, Product__c from Variant__c where Product__c in (${this.helper.connection.QUERY_LIST})`
        ), Object.keys(this.productIdName).map((pId) => `'${pId}'`))

        for (let variant of this.productVariants) {
          const productName = this.productIdName[variant[this.helper.namespace('Product__c')]]
          if (!this.productVariantMap.has(productName)) {
            this.productVariantMap.set(productName, [])
          }
          this.productVariantMap.get(productName).push(variant)
        }
      }
    } catch(error) {
      this.log.addToLogs([{errors: [error] }], this.helper.namespace('Product__c'))

      console.log(error)
    }
  }

  getNameMap() {
    return new Map(
      this.products.map(product => {
        return [product.Name, product.Id]
      })
    )
  }

  getHasVariantMap() {
    return this.productVariantMap
  }
}

module.exports = PimProduct
