const ObjectsToCsv = require('objects-to-csv')
const PimProductDeep = require('../service/PimProductDeep')
const propelConnect = require('@propelsoftwaresolutions/propel-sfdc-connect')

let fs = require('fs')

class ExportProduct {

/**
 * @param {HttpRequest} req
 */
  constructor(req) {
    const {
      hostUrl,
      options,
      recordIds,
      sessionId,
      variantValueIds
    } = req.body

    this.isListPageExport = options.isListPageExport
    this.exportObjects = new Array()
    this.fileName
    this.postToUsersChatter = true
    this.productIds = recordIds
    this.productMap
    this.variantValueIds = variantValueIds

    this.connection = propelConnect.newConnection(hostUrl, sessionId)
    this.helper = propelConnect.newHelper(this.connection, {}, this.namespace, {})
    this.log = propelConnect.newLog(this.connection)
    this.chatter = propelConnect.newChatter(this.connection)

    this.start()
  }

  async start() {

    this.createFileName()
    // - queries for selected products
    await this.populateProductMap()

    this.buildExportObject()

    await this.convertToCsv()

    await this.sendToChatter()

    this.cleanUpLocalFile()

    // finish up with sending the log file
    //await this.log.sendReport()
  }

  createFileName() {
    console.log('createFileName')
    let date = new Date();
    this.fileName = `Product-Export_${date.getTime()}.csv`
  }

  async populateProductMap() {
    console.log('populateProductArray')
    const querySaveProductIds = this.productIds.map(productId => {
      return `'${productId}'`
    })
    const pimProductDeep = new PimProductDeep(this.helper, this.log, querySaveProductIds)
    await pimProductDeep.populate()
    this.productMap = pimProductDeep.getProductNameMap()
  }

  buildExportObject() {
    console.log('buildExportObject')

    for (const key of this.productMap.keys()) {

      const tmpObject = new Object()
      tmpObject['product_id'] = key

      this.productMap.get(key).forEach(attribute => {
        tmpObject[attribute['Attribute_Label__r'].Label__c] = attribute['Value__c']
      })

      this.exportObjects.push(tmpObject)
    }
  }

  async convertToCsv() {
    console.log('convertToCsv')
    const csv = new ObjectsToCsv(this.exportObjects)

    try {
      await csv.toDisk(`./${this.fileName}`, { bom: true })
    } catch(error) {
      console.log(error)
    }
  }

  async sendToChatter() {
    console.log('sendToChatter')
    //const fileStream = fs.createReadStream(`./${this.fileName}`)
    //fileStream.destroy(error => {console.log('stream error ' + error)})
    this.chatter.postToChatterWithFile(
      this.fileName,
      '',
      false,
      true,
      {}
    )
  }

  async cleanUpLocalFile() {
    console.log('cleanUpLocalFile')
    try {
      fs.unlinkSync(`./${this.fileName}`);
  
      //this.log.addToLogs() TODO: add a function to add logs that are not results
    } catch (error) {
        console.log(error);
    }
  }
}

module.exports = ExportProduct;
