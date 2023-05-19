const PimCategory = require('../service/PimCategory')
const PimAttributeGroup = require('../service/PimAttributeGroup')
const PimAttributeLabel = require('../service/PimAttributeLabel')
const propelConnect = require('@propelsoftwaresolutions/propel-sfdc-connect')
const { convertDataByType, getSessionId } = require('./utility')

class ImportAttributeLabel {

  /**
   * @param {HttpRequest} req
   * @param {HttpResponse} res
   */
  constructor(req, res) {
    const {
      batchsize,
      data,
      isTest,
      namespace,
      options,
      orgId,
      user
    } = req.body

    this.attributeLabelNameMap
    this.attributeGroupNameMap
    this.batchsize = batchsize
    this.categoryMap
    this.data = data
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
    await this.populateAttributeGroupMap()
    await this.processLineByLine()
    await this.populateAttributeLabelNameMap()
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

  async populateAttributeGroupMap() {
    this.attributeGroupNameMap = new Map()
    const pimAttributeGroup = new PimAttributeGroup(this.helper, this.log)
    await pimAttributeGroup.populate()
    this.attributeGroupNameMap = pimAttributeGroup.getNameMap()
  }

  async populateAttributeLabelNameMap() {
    this.attributeLabelMap = new Map()
    const pimAttributeLabel = new PimAttributeLabel(this.helper, this.log)
    await pimAttributeLabel.populate()
    this.attributeLabelNameMap = pimAttributeLabel.getNameMap()
  }

  async processLineByLine() {
    let attributeLabels = new Array()

    this.propelParser.nodes.forEach((node) => {
      let tmpAttributeLabel = new Object()
      tmpAttributeLabel['Name'] = node.name
      tmpAttributeLabel[this.helper.namespace('Classification__c')] = node.classification
      tmpAttributeLabel[this.helper.namespace('Rank__c')] = node.rank
      tmpAttributeLabel[this.helper.namespace('Attribute_Group__c')] = this.attributeGroupNameMap.get(node.attribute_group)
      tmpAttributeLabel[this.helper.namespace('Is_Localizable__c')] = node.localizable
      tmpAttributeLabel[this.helper.namespace('Is_Searchable__c')] = node.searchable

      attributeLabels.push(tmpAttributeLabel)
    })

    let results = await this.connection.insert(
      this.helper.namespace('Attribute_Label__c'),
      attributeLabels
    )
    this.log.addToLogs(results, this.helper.namespace('Attribute_Label__c'))
  }

  async addLinks() {
    let attributeLabelLinks = new Array()
    let tmpAttributeLabelLink = new Object()

    this.propelParser.nodes.forEach((node) => {

      node.category_associations.split(';').forEach((cat) => {
        tmpAttributeLabelLink = new Object()
        tmpAttributeLabelLink[this.helper.namespace('Attribute_Label__c')] = this.attributeLabelNameMap.get(node.name)
        tmpAttributeLabelLink[this.helper.namespace('Category__c')] = this.categoryMap.get(cat)

        attributeLabelLinks.push(tmpAttributeLabelLink)
      })
    })

    let results = await this.connection.insert(
      this.helper.namespace('Attribute_Label_Link__c'),
      attributeLabelLinks
    )
    this.log.addToLogs(results, this.helper.namespace('Attribute_Label_Link__c'))
  }
}

module.exports = ImportAttributeLabel
