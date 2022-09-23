class PimProduct {

  /**
   * @param {PropelHelper} helper
   * @param {PropelLog} log
   * @param {Array} productNames
   */
  constructor(helper, log, productNames) {
    this.helper = helper
    this.log = log
    this.products = []
    this.productNames = productNames
  }

  async populate() {
    try {
      const formatedNames = this.productNames.join(',')

      const result = await this.helper.connection.simpleQuery(this.helper.namespaceQuery(
        `select Id, Name, (select Id, Name from Variants__r) from Product__c where Name in (${formatedNames})`
      ))
      this.products = result.records
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
    return new Map(
      this.products.map(product => {
        return [product['Name'], product[this.helper.namespace('Variants__r')]]
      })
    )
  }
}

module.exports = PimProduct
