class PimVariantValue {

  /**
   * @param {PropelHelper} helper
   * @param {PropelLog} log
   * @param {[string]} variantNames
   */
  constructor(helper, log, variantNames) {
    this.helper = helper
    this.log = log
    this.variantNames = variantNames
    this.variantValues = []
  }

  async populate() {
    try {
      this.variantValues = await this.helper.connection.queryExtend(this.helper.namespaceQuery(
        `select Id, Name from Variant_Value__c where Name in (${this.helper.connection.QUERY_LIST})`
      ), this.variantNames)
    } catch(error) {
      this.log.addToLogs([{errors: [error] }], this.helper.namespace('Variant_Value__c'))

      console.log(error)
    }
  }

  getNameMap() {
    return new Map(
      this.variantValues.map(variantValue => {
        return [variantValue.Name, variantValue.Id]
    }))
  }
}

module.exports = PimVariantValue
