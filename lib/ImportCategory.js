const ImportClass = require('./ImportClass')
const PimCategory = require('../service/PimCategory')

class ImportCategory extends ImportClass {

  /**
   * @param {HttpRequest} req
   * @param {HttpResponse} res
   */
  constructor(req, res) {
    super(req, res)

    this.rootCategory
    this.categoryMap

    this.start()
  }

  async start() {
    console.log('start')

    await this.connect()
    console.log('finished connecting')

    await this.getRootCategory()
    console.log('finished getting root category')

    await this.insertAllCategories()
    console.log('finished inserting all categories')

    await this.populateCategoryMap()
    console.log('finished populating category map')

    await this.updateCategoryParents()
    console.log('finished updating parents')

    // finish up
    await this.log.sendReport()
    console.log('sent log')
  }

  async getRootCategory() {
    try {
      this.rootCategory = await this.helper.connection.queryLimit(this.helper.namespaceQuery(
        `select Id, Name, Category_Id__c from Category__c where Is_Primary__c = true AND Parent__c = null limit 1`
      ))
    } catch(error) {
      this.log.addToLogs([{errors: [error] }], this.helper.namespace('Category__c'))

      console.log(error)
    }
  }

  async populateCategoryMap() {
    this.categoryMap = new Map()
    const pimCategory = new PimCategory(this.helper, this.log)
    await pimCategory.populate()
    this.categoryMap = pimCategory.getIdMap()
  }

  async insertAllCategories() {
    let tmpCategory
    const insertCategories = new Array()

    for (let x = 0; x < this.propelParser.nodes.length; x++) {
      tmpCategory = new Object()
      tmpCategory['Name'] = this.propelParser.nodes[x].name
      tmpCategory[this.helper.namespace('Category_Id__c')] = this.propelParser.nodes[x].category_id
      tmpCategory[this.helper.namespace('Classification__c')] = 'Product'
      tmpCategory[this.helper.namespace('Is_Primary__c')] = true
      tmpCategory[this.helper.namespace('Parent__c')] = this.rootCategory[0].Id
      
      insertCategories.push(tmpCategory)
    }

    if (insertCategories.length > 0) {
      let results = await this.connection.insertSlice(
        this.helper.namespace('Category__c'),
        insertCategories,
        100
      )

      this.log.addToLogs(results, this.helper.namespace('Category__c'))
    }
  }

  async updateCategoryParents() {
    let tmpCategory
    const updateCategories = new Array()

    for (let x = 0; x < this.propelParser.nodes.length; x++) {
      if (this.propelParser.nodes[x].parent_category_id) {
        tmpCategory = new Object()
        tmpCategory['Id'] = this.categoryMap.get(this.propelParser.nodes[x].category_id)
        tmpCategory[this.helper.namespace('Parent__c')] = this.categoryMap.get(this.propelParser.nodes[x].parent_category_id)
        
        updateCategories.push(tmpCategory)
      }
    }

    if (updateCategories.length > 0) {
      let results = await this.connection.update(
        this.helper.namespace('Category__c'),
        updateCategories
      )

      this.log.addToLogs(results, this.helper.namespace('Category__c'))
    }
  }
}

module.exports = ImportCategory
