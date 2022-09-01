class PimAttributeLabel {

  /**
   * @param {PropelHelper} helper
   * @param {PropelLog} log
   */
  constructor(helper, log) {
    this.attributeLabels = []
    this.helper = helper
    this.log = log
  }

  async populate() {
    try {
      this.attributeLabels = await this.helper.connection.queryLimit(this.helper.namespaceQuery(
        `select Id, Primary_Key__c from Attribute_Label__c`
      ))
    } catch(error) {
      this.log.addToLogs([{errors: [error] }], this.helper.namespace('Attribute_Label__c'))

      console.log(error)
    }
  }

  getNameMap() {
    return new Map(
      this.attributeLabels.map(attributeLabel => {
        return [attributeLabel[this.helper.namespace('Primary_Key__c')], attributeLabel.Id]
      })
    )
  }
}

module.exports = PimAttributeLabel
