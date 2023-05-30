const ImportClass = require('./ImportClass')
const PimCategory = require('../service/PimCategory')

class ImportCategory extends ImportClass {

  /**
   * @param {HttpRequest} req
   * @param {HttpResponse} res
   */
  constructor(req, res) {
    super(req, res)
    this.categoryMap

    this.start()
  }

  async start() {
    await this.connect()

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
