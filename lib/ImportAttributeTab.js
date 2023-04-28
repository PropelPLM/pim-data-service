const PimCategory = require('../service/PimCategory')
const PimAttributeTab = require('../service/PimAttributeTab')
const propelConnect = require('@propelsoftwaresolutions/propel-sfdc-connect')

class ImportAttributeTab {

  /**
   * @param {HttpRequest} req
   * @param {HttpResponse} res
   */
  constructor(req, res) {
    const {
      batchsize,
      clientId,
      data,
      isTest,
      namespace,
      options,
      orgId,
      user
    } = req.body

    this.attributeTabNameMap
    this.batchsize = batchsize
    this.categoryMap
    this.clientId = clientId
    this.data = data
    this.isTest = isTest
    this.namespace = namespace
    this.orgId = orgId
    this.options = options
    this.user = user

    this.connection
    this.propelParser = propelConnect.newParser(this.data)
    this.helper
    this.log

    this.start()
  }

  async start() {

    await this.getSessionId()

    this.connection = propelConnect.newConnection(
      this.response.instance_url,
      this.response.access_token  
    )
    this.helper = propelConnect.newHelper(this.connection, {}, this.namespace, {})
    this.log = propelConnect.newLog(this.connection)
  
    await this.propelParser.parseCsv()
    await this.populateCategoryMap()
    await this.processLineByLine()
    await this.populateAttributeTabMap()
    await this.addLinks()

    // finish up
    await this.log.sendReport()
  }

  async getSessionId() {
    this.response = await propelConnect.jwtSession({
      clientId: this.clientId,
      isTest: this.isTest,
      privateKey: process.env.PIM_DATA_SERVICE_KEY,
      user: this.user
    })
  }

  async populateCategoryMap() {
    this.categoryMap = new Map()
    const pimCategory = new PimCategory(this.helper, this.log)
    await pimCategory.populate()
    this.categoryMap = pimCategory.getIdMap()
  }

  async populateAttributeTabMap() {
    this.attributeTabNameMap = new Map()
    const pimAttributeTab = new PimAttributeTab(this.helper, this.log)
    await pimAttributeTab.populate()
    this.attributeTabNameMap = pimAttributeTab.getNameMap()
  }

  async processLineByLine() {
    let attributeTabs = new Array()

    this.propelParser.nodes.forEach((node) => {
      let tmpAttributeTab = new Object()
      tmpAttributeTab['Name'] = node.name
      tmpAttributeTab[this.helper.namespace('Classification__c')] = node.classification
      tmpAttributeTab[this.helper.namespace('Rank__c')] = node.rank

      attributeTabs.push(tmpAttributeTab)
    })

    let results = await this.connection.insert(
      this.helper.namespace('Attribute_Tab__c'),
      attributeTabs
    )
    this.log.addToLogs(results, this.helper.namespace('Attribute_Tab__c'))
  }

  async addLinks() {
    let attributeTabLinks = new Array()
    let tmpAttributeTabLink = new Object()

    this.propelParser.nodes.forEach((node) => {

      node.category_associations.split(';').forEach((cat) => {
        tmpAttributeTabLink = new Object()
        tmpAttributeTabLink[this.helper.namespace('Attribute_Tab__c')] = this.attributeTabNameMap.get(node.name)
        tmpAttributeTabLink[this.helper.namespace('Category__c')] = this.categoryMap.get(cat)

        attributeTabLinks.push(tmpAttributeTabLink)
      })
    })

    let results = await this.connection.insert(
      this.helper.namespace('Attribute_Tab_Link__c'),
      attributeTabLinks
    )
    this.log.addToLogs(results, this.helper.namespace('Attribute_Tab_Link__c'))
  }
}

module.exports = ImportAttributeTab
