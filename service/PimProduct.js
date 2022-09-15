class PimProduct {

  /**
   * @param {PropelHelper} helper
   * @param {PropelLog} log
   */
  constructor(helper, log) {
    this.helper = helper
    this.log = log
    this.products = []
  }

  async populate() {
    try {
      this.products = await this.helper.connection.queryLimit(this.helper.namespaceQuery(
        `select Id, Name, (select Id, Name from Variants__r) from Product__c`
      ))
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
