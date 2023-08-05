const ImportClass = require('./ImportClass');
const ImportConfiguration = require('../obj/ImportConfiguration')
const { convertToCsv } = require('./utility');
const { postToChatter } = require('../legacy/utils');

var fs = require('fs')
var https = require('https')

class ImportCommerceProduct extends ImportClass {
  /**
  * @param {HttpRequest} req
  * @param {HttpResponse} res
  */
  constructor(req, res) {
    super(req, res)

    this.fieldMapping = req.body.mapping.fieldMapping
    this.productImport = []

    this.start()
  }

  async start() {
    await this.connect()

    await this.fileProcessing()
    await this.saveFileToSfdc()
    await this.sendToProductApi()

    // finish up
    await this.log.sendReport()
  }

  async fileProcessing() {

    this.propelParser.nodes.forEach((node) => {
      const newObj = new Object()

      Object.keys(this.fieldMapping).forEach(key => {
        if (node[key]) {
          newObj[this.fieldMapping[key]] = node[key]
        }
      })
      
      this.productImport.push(newObj)
    })
  }

  async saveFileToSfdc() {
    const reqBody = {
      communityId: null,
      hostUrl: this.response.instance_url.replace(/(^\w+:|^)\/\//, ''),
      sessionId: this.response.access_token,
      shouldPostToUser: true
    }
    const filename = 'commerce_product_import.csv'
    const nameOnDisk = `${Date.now()}_${filename}`
    const file = fs.createWriteStream(nameOnDisk)

    file.write(convertToCsv(this.productImport), () => {
      try {
        postToChatter(
          filename,
          nameOnDisk,
          null,
          reqBody,
          '',
          false
        )
      } catch (err) {
        console.log('error: ', err)
      }
    })
  }

  async sendToProductApi() {
    var options = {
      hostname: this.response.instance_url.replace(/(^\w+:|^)\/\//, ''),
      path: `/services/data/v58.0/commerce/management/webstores/0ZEDS0000000dtY4AQ/product-import`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json; charset=UTF-8',
        Authorization: 'OAuth ' + this.response.access_token
      }
    }

    const importConfigStr = JSON.stringify(new ImportConfiguration(
      '068DS000002ErOaYAK', // contentVersionId,
      '0ZSDS0000008zru4AA', // productCatalogId
      '0ZuDS00000098Y30AI', //cmsWorkspaceId
      { standard: '01sDS000009b1FSYAY' }, // pricebookIds
      '1CeDS0000000bXa0AI'// defaultEntitlementPolicyId
    ))

    var req = new https.request(options, res => {
      console.log('send to Product Api ', res.statusCode)
      
      res.setEncoding('utf8');
      res.on('data', (responseBody) => {
        const responseObj = JSON.parse(responseBody)
        if (responseObj.numberError > 0) {
          console.log(`ERROR_COMMERCE_PRODUCT_CSV_API: ${responseObj.errorMessage}`)
        }
      })
    })

    req.on('error', function (e) {
      console.log('Error with req', e)
    })

    req.write(importConfigStr)
    req.end()

  }
}

module.exports = ImportCommerceProduct
