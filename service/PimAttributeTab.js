class PimAttributeTab {

    /**
     * @param {PropelHelper} helper
     * @param {PropelLog} log
     */
    constructor(helper, log) {
      this.attributeTabs = []
      this.helper = helper
      this.log = log
    }
  
    async populate() {
      try {
        this.attributeTabs = await this.helper.connection.queryLimit(this.helper.namespaceQuery(
          `select Id, Name from Attribute_Tab__c`
        ))
      } catch(error) {
        this.log.addToLogs([{errors: [error] }], this.helper.namespace('Attribute_Tab__c'))
  
        console.log(error)
      }
    }
  
    getNameMap() {
      return new Map(
        this.attributeTabs.map(tab => {
          return [tab.Name, tab.Id]
        })
      )
    }
  }
  
  module.exports = PimAttributeTab
  