const ImportClass = require('./ImportClass')
const PimCategory = require('../service/PimCategory')
const PimAttributeGroup = require('../service/PimAttributeGroup')
const PimAttributeLabel = require('../service/PimAttributeLabel')

class ImportAttributeLabel extends ImportClass {

  /**
   * @param {HttpRequest} req
   * @param {HttpResponse} res
   */
  constructor(req, res) {
    console.log(req.data)
    super(req, res)

    this.attributeLabelNameMap
    this.attributeGroupNameMap
    this.categoryMap

    this.start()
  }

  async start() {
    await this.connect()

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
      console.log(node)
      let tmpAttributeLabel = new Object()
      
      tmpAttributeLabel['Name'] = node.name
      tmpAttributeLabel[this.helper.namespace('Attribute_Group__c')] = this.attributeGroupNameMap.get(node.attribute_group)
      tmpAttributeLabel[this.helper.namespace('Classification__c')] = node.classification
      tmpAttributeLabel[this.helper.namespace('Is_Localizable__c')] = node.localizable
      tmpAttributeLabel[this.helper.namespace('Is_Searchable__c')] = node.searchable
      tmpAttributeLabel['Label__c'] = node.name
      tmpAttributeLabel[this.helper.namespace('Rank__c')] = node.rank
      tmpAttributeLabel[this.helper.namespace('Type__c')] = node.type

      if (node.picklist_values) {
        tmpAttributeLabel[this.helper.namespace('Picklist_Values__c')] = node.picklist_values.replace(';', '\n')
      }

      attributeLabels.push(tmpAttributeLabel)
    })
    console.log('attributeLables')
    console.log(attributeLabels)

    let results = await this.connection.insert(
      this.helper.namespace('Attribute_Label__c'),
      attributeLabels
    )

    console.log('ATTRIBUTE_LABEL_INSERT_RESULT')
    console.log(results)
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
    console.log('ATTRIBUTE_LABEL_LINK_RESULTS')
    console.log(results)
    this.log.addToLogs(results, this.helper.namespace('Attribute_Label_Link__c'))
  }
}

module.exports = ImportAttributeLabel
