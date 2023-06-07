class PimAttributeGroup {

    /**
     * @param {PropelHelper} helper
     * @param {PropelLog} log
     */
    constructor(helper, log) {
      this.attributeGroups = []
      this.helper = helper
      this.log = log
    }
  
    async populate() {
      try {
        this.attributeGroups = await this.helper.connection.queryLimit(this.helper.namespaceQuery(
          `select Id, Name from Attribute_Group__c`
        ))
      } catch(error) {
        this.log.addToLogs([{errors: [error] }], this.helper.namespace('Attribute_Group__c'))
  
        console.log(error)
      }
    }
  
    getNameMap() {
      return new Map(
        this.attributeGroups.map(group => {
          return [group.Name, group.Id]
        })
      )
    }
  }
  
  module.exports = PimAttributeGroup
  