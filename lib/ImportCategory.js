const PimCategory = require('../service/PimCategory')
const propelConnect = require('@propelsoftwaresolutions/propel-sfdc-connect')

class ImportCategory {

  /**
   * @param {HttpRequest} req
   * @param {HttpResponse} res
   */
  constructor(req, res) {
    const {
      batchsize,
      data,
      hostUrl,
      namespace,
      options,
      orgId,
      sessionId
    } = req.body

    this.batchsize = batchsize
    this.categoryMap
    this.data = data
    this.namespace = namespace
    this.orgId = orgId
    this.options = options

    this.connection = propelConnect.newConnection(hostUrl, sessionId)
    this.propelParser = propelConnect.newParser(this.data)
    this.helper = propelConnect.newHelper(this.connection, {}, this.namespace, {})
    this.log = propelConnect.newLog(this.connection, this.orgId)

    this.start()
  }

  async start() {
  
    await this.propelParser.parseCsv()
    await this.populateCategoryMap()
    await this.processLineByLine()

    // finish up
    await this.log.sendReport()
  }

  async populateCategoryMap() {
    this.categoryMap = new Map()
    const pimCategory = new PimCategory(this.helper, this.log)
    await pimCategory.populate()
    this.categoryMap = pimCategory.getIdMap()
  }

  async processLineByLine() {
    let tmpCategory

    for (let x = 0; x < this.propelParser.nodes.length; x++) {
      tmpCategory = new Object()
      tmpCategory['Name'] = this.propelParser.nodes[x].name
      tmpCategory[this.helper.namespace('Category_Id__c')] = this.propelParser.nodes[x].category_id
      tmpCategory[this.helper.namespace('Classification__c')] = 'Product'
      tmpCategory[this.helper.namespace('Is_Primary__c')] = true
      tmpCategory[this.helper.namespace('Parent__c')] = this.categoryMap.get(this.propelParser.nodes[x].parent_category_id)

      let results = await this.connection.insert(
        this.helper.namespace('Category__c'),
        new Array(tmpCategory)
      )
      this.log.addToLogs(results, this.helper.namespace('Category__c'))

      await this.populateCategoryMap()
    }
  }
}

module.exports = ImportCategory
