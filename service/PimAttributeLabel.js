class PimAttributeLabel {

  /**
   * @param {PropelHelper} helper
   * @param {PropelLog} log
   */
  constructor(helper, log, names = []) {
    this.attributeLabelNames = names
    this.attributeLabels = []
    this.helper = helper
    this.log = log
  }

  async populate() {
    try {
      let basedQueryStr = `select Id, Name, Primary_Key__c from Attribute_Label__c`
      if (this.attributeLabelNames?.length) {
        basedQueryStr += ` where Name in (${this.attributeLabelNames.join(',')})`
      }
      this.attributeLabels = await this.helper.connection.queryLimit(this.helper.namespaceQuery(
        basedQueryStr
      ))
    } catch(error) {
      this.log.addToLogs([{errors: [error] }], this.helper.namespace('Attribute_Label__c'))

      console.log(error)
    }
  }

  getNameMap() {
    return new Map(
      this.attributeLabels.map(attributeLabel => {
        return [attributeLabel.Name, attributeLabel.Id]
      })
    )
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
