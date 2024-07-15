const ImportClass = require('./ImportClass')
const PimCategory = require('../service/PimCategory')
const PimAttributeTab = require('../service/PimAttributeTab')

class ImportAttributeTab extends ImportClass {

  /**
   * @param {HttpRequest} req
   * @param {HttpResponse} res
   */
  constructor(req, res) {
    super(req, res)

    this.attributeTabNameMap
    this.categoryMap

    this.start()
  }

  async start() {
    try {
      await this.connect();

      await this.populateCategoryMap();
      await this.processLineByLine();
      await this.populateAttributeTabMap();
      await this.addLinks();

      // finish up
      await this.log.sendReport();
    } catch (error) {
      console.error(error);
    }
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
    console.log(JSON.stringify(results))
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
    console.log(JSON.stringify(results))
    this.log.addToLogs(results, this.helper.namespace('Attribute_Tab_Link__c'))
  }
}

module.exports = ImportAttributeTab
