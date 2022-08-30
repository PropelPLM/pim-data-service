const PimCategory = require('../service/PimCategory')
//const Database = require('./Database')
//const ImportLog = require('./ImportLog')
const parse = require('csv-parser')
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
      sessionId,
      skipDB
    } = req.body

    this.batchsize = batchsize
    this.categoryMap
    this.data = data
    this.eventId = ''
    this.httpRes = res
    this.logs = []
    this.namespace = namespace
    this.nodes = []
    this.options = options

    this.service = propelConnect.newConnection(hostUrl, sessionId)
    this.helper = propelConnect.newHelper(this.service, {}, this.namespace, {})
    //this.dbService = new Database(orgId, skipDB)
    
    this.start()
  }

  async start() {

    //await this.dbService.connect()

    //await this.createEvent()

    await this.parseCsv()
    //await this.dbService.updateEventCount(this.nodes.length)

    await this.populateCategoryMap()
    await this.processLineByLine()

    // finish up
    //await this.sendReport()
    //await this.dbService.disconnect()
  }

  async createEvent() {
    try {
      this.eventId = await this.dbService.insertEvent(0)
      this.httpRes.send({ eventId: this.eventId })
    } catch (e) {
      this.httpRes.status(400)
      this.httpRes.send('Fail to create event number. Please connect admin.')
    }
    return
  }

  parseCsv() {
    if (!this.data) {
      this.logs.push(new ImportLog('', '', '', false, 'No data was found in payload', false))
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
    const pimCategory = new PimCategory(this.helper)
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

      let results = await this.service.insert(
        this.helper.namespace('Category__c'),
        new Array(tmpCategory)
      )
      this._addToLogs(results, 'Category__c')

      await this.populateCategoryMap()
    }
  }

  /**
   * send the log results to the org
   */
  async sendReport() {
    try {
      const res = await this.service.uploadFile(this.eventId, this.logs)
      const reportRes = JSON.parse(res || '{}')
      if (!reportRes.success) {
        throw new Error('Fail to log file ' + JSON.stringify(reportRes))
      }
    } catch (e) {
      console.error(e.stack)
    }
  }

  _addToLogs(results, sObjectName) {
    results.forEach(result => {
      this.logs.push(new ImportLog(
        this.helper.namespace(sObjectName),
        result.Id,
        '',
        result.success,
        result.errors.map((e) => '' + e),
        true
      ))
    })
  }
}

module.exports = ImportCategory
