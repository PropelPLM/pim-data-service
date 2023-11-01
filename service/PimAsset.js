class PimAsset {

  /**
   * @param {PropelHelper} helper
   * @param {PropelLog} log
   * @param {[string]} assetNames
   */
  constructor(helper, log, assetNames) {
    this.helper = helper
    this.log = log
    this.assetNames = assetNames
    this.assets = []
  }

  async populate() {
    try {
      console.log('this.assetNames: ', this.assetNames)
      console.log('this.helper.connection.QUERY_LIST: ', this.helper.connection.QUERY_LIST)
      this.assets = await this.helper.connection.queryExtend(this.helper.namespaceQuery(
        `select Id, Name from Digital_Asset__c where Name in (${this.helper.connection.QUERY_LIST})`
      ), this.assetNames)
    } catch(error) {
      this.log.addToLogs([{errors: [error] }], this.helper.namespace('Digital_Asset__c'))

      console.log(error)
    }
  }

  getNameMap() {
    return new Map(
      this.assets.map(asset => {
        return [asset.Name, asset.Id]
    }))
  }
}

module.exports = PimAsset
