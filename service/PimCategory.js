//const ImportLog = require('../ImportLog')

class PimCategory {

  /**
   * @param {ImportHelper} helper
   */
  constructor(helper) {
    this.categories = []
    this.helper = helper
    this.logs = []
  }

  async populate() {
    try {
      this.categories = await this.helper.service.queryLimit(this.helper.namespaceQuery(
        `select Id, Name, Category_Id__c from Category__c`
      ))
    } catch(error) {
    //   this.logs.push(new ImportLog(
    //     this.helper.namespace + 'Category__c',
    //     '',
    //     '',
    //     '',
    //     error,
    //     false
    //   ))

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
