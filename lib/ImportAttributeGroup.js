const PimCategory = require('../service/PimCategory')
const PimAttributeGroup = require('../service/PimAttributeGroup')
const PimAttributeTab = require('../service/PimAttributeTab')
const propelConnect = require('@propelsoftwaresolutions/propel-sfdc-connect')
const { convertDataByType, getSessionId } = require('./utility')

class ImportAttributeGroup {

  /**
   * @param {HttpRequest} req
   * @param {HttpResponse} res
   */
  constructor(req, res) {
    const {
      batchsize,
      data,
      dataType,
      isTest,
      namespace,
      options,
      orgId,
      user
    } = req.body

    this.attributeGroupNameMap
    this.attributeTabNameMap
    this.batchsize = batchsize
    this.categoryMap
    this.data = data
    this.dataType = dataType
    this.isTest = isTest
    this.namespace = namespace
    this.orgId = orgId
    this.options = options
    this.user = user

    this.connection
    this.propelParser = convertDataByType(this.data, this.dataType)
    this.helper
    this.log

    this.start()
  }

  async start() {

    this.response = await getSessionId({
      isTest: this.isTest,
      user: this.user,
    })

    this.connection = propelConnect.newConnection(
      this.response.instance_url,
      this.response.access_token
    )
    this.helper = propelConnect.newHelper(this.connection, {}, this.namespace, {})
    this.log = propelConnect.newLog(this.connection)

    await this.propelParser.parseCsv()
    await this.populateCategoryMap()
    await this.populateAttributeTabMap()
    await this.processLineByLine()
    await this.populateAttributeGroupMap()
    await this.addLinks()

    // finish up
    await this.log.sendReport()
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

  async populateAttributeGroupMap() {
    this.attributeGroupNameMap = new Map()
    const pimAttributeGroup = new PimAttributeGroup(this.helper, this.log)
    await pimAttributeGroup.populate()
    this.attributeGroupNameMap = pimAttributeGroup.getNameMap()
  }

  async processLineByLine() {
    let attributeGroups = new Array()

    this.propelParser.nodes.forEach((node) => {
      let tmpAttributeGroup = new Object()
      tmpAttributeGroup['Name'] = node.name
      tmpAttributeGroup[this.helper.namespace('Classification__c')] = node.classification
      tmpAttributeGroup[this.helper.namespace('Rank__c')] = node.rank
      tmpAttributeGroup[this.helper.namespace('Attribute_Tab__c')] = this.attributeTabNameMap.get(node.attribute_tab)

      attributeGroups.push(tmpAttributeGroup)
    })

    let results = await this.connection.insert(
      this.helper.namespace('Attribute_Group__c'),
      attributeGroups
    )
    this.log.addToLogs(results, this.helper.namespace('Attribute_Group__c'))
  }

  async addLinks() {
    let attributeGroupLinks = new Array()
    let tmpAttributeGroupLink = new Object()

    this.propelParser.nodes.forEach((node) => {

      node.category_associations.split(';').forEach((cat) => {
        tmpAttributeGroupLink = new Object()
        tmpAttributeGroupLink[this.helper.namespace('Attribute_Group__c')] = this.attributeGroupNameMap.get(node.name)
        tmpAttributeGroupLink[this.helper.namespace('Category__c')] = this.categoryMap.get(cat)

        attributeGroupLinks.push(tmpAttributeGroupLink)
      })
    })

    let results = await this.connection.insert(
      this.helper.namespace('Attribute_Group_Link__c'),
      attributeGroupLinks
    )
    this.log.addToLogs(results, this.helper.namespace('Attribute_Group_Link__c'))
  }
}

module.exports = ImportAttributeGroup
