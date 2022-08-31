class PimCategory {

  /**
   * @param {ImportHelper} helper
   * @param {ImportLog} log
   */
  constructor(helper, log) {
    this.categories = []
    this.helper = helper
    this.log = log
  }

  async populate() {
    try {
      this.categories = await this.helper.connection.queryLimit(this.helper.namespaceQuery(
        `select Id, Name, Category_Id__c from Category__c`
      ))
    } catch(error) {
      //TODO: figure out what to send to the logs.
      console.log(error)
    }
  }

  getNameMap() {
    return new Map(
      this.categories.map(cat => {
        return [cat.Name, cat.Id]
      })
    )
  }

  getIdMap() {
    return new Map(
      this.categories.map(cat => {
        return [cat[this.helper.namespace('Category_Id__c')], cat.Id]
      })
    )
  }
}

module.exports = PimCategory
