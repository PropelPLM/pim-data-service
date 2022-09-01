const PimCategory = require('../service/PimCategory')
const propelConnect = require('@propelsoftwaresolutions/propel-sfdc-connect')
const parse = require('csv-parser')

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
    this.nodes = []
    this.orgId = orgId
    this.options = options

    this.connection = propelConnect.newConnection(hostUrl, sessionId)
    this.helper = propelConnect.newHelper(this.connection, {}, this.namespace, {})
    this.log = propelConnect.newLog(this.connection, this.orgId)

    this.start()
  }

  async start() {
    await this.parseCsv()

    await this.populateCategoryMap()
    await this.processLineByLine()

    // finish up
    await this.log.sendReport()
  }

  parseCsv() {
    if (!this.data) {
      this.log.addToLogs(
        [{ errors: ['No data was found in payload']}],
        ''
      )
    } else {
      return new Promise((resolve) => {
        const parser = parse({
          mapValues: ({ value }) => value.trim()
        })
        parser.on('data', (d) => { this.nodes.push(d) })
        parser.on('end', () => { resolve() })
        parser.write(this.data)
        parser.end()
      })
    }
  }

  async populateCategoryMap() {
    this.categoryMap = new Map()
    const pimCategory = new PimCategory(this.helper, this.log)
    await pimCategory.populate()
    this.categoryMap = pimCategory.getIdMap()
  }

  async processLineByLine() {
    let tmpCategory

    for (let x = 0; x < this.nodes.length; x++) {
      tmpCategory = new Object()
      tmpCategory['Name'] = this.nodes[x].name
      tmpCategory[this.helper.namespace('Category_Id__c')] = this.nodes[x].category_id
      tmpCategory[this.helper.namespace('Classification__c')] = 'Product'
      tmpCategory[this.helper.namespace('Is_Primary__c')] = true
      tmpCategory[this.helper.namespace('Parent__c')] = this.categoryMap.get(this.nodes[x].parent_category_id)

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
