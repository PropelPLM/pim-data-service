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
        `select Id, Name, Primary_Key__c from Attribute_Label__c`
      ))
    } catch(error) {
      this.log.addToLogs([{errors: [error] }], this.helper.namespace('Attribute_Label__c'))

      console.log(error)
    }
  }

  /**
   * 
   * @returns map of primary key and sobject Id
   */
  getPrimaryKeyIdMap() {
    return new Map(
      this.attributeLabels.map(attributeLabel => {
        return [attributeLabel[this.helper.namespace('Primary_Key__c')], attributeLabel.Id]
      })
    )
  }

  getPrimaryKeyNameMap() {
    return new Map(
      this.attributeLabels.map(attributeLabel => {
        return [attributeLabel[this.helper.namespace('Primary_Key__c')], attributeLabel.Name]
      })
    )
  }
}

module.exports = PimAttributeLabel
