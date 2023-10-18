const ImportClass = require('./ImportClass')
const CommerceParentVariant = require('../service/CommerceParentVariant')
const ImportConfiguration = require('../obj/ImportConfiguration')


var fs = require('fs')
var https = require('https')
const { resolve } = require('path')
const { rejects } = require('assert')

class ImportCommerceProduct extends ImportClass {
  /**
  * @param {HttpRequest} req
  * @param {HttpResponse} res
  */
  constructor(req, res) {
    super(req, res)

    this.alternateCategoryId = req.body.alternateCategoryId
    this.cmsWorkspaceId = req.body.cmsWorkspaceId
    this.contentVersionResponse = ''
    this.defaultEntitlementPolicyId = req.body.defaultEntitlementPolicyId
    this.importApi = ''
    this.mapping = req.body.mapping
    this.pimProductId = req.body.pimProductId
    this.productCatalogId = req.body.productCatalogId
    this.pricebookIds = req.body.pricebookIds
    this.webstoreId = req.body.webstoreId

    this.start()
  }

  async start() {
    await this.connect()

    await this.createVariantParent()

    // finish up
    await this.log.sendReport()
  }

  async createVariantParent() {
    const cpv = new CommerceParentVariant(
      this.helper,
      this.pimProductId,
      this.alternateCategoryId,
      this.mapping,
      this.log,
      this.response
    )

    console.log('starting the import process')

    console.log('starting fetching data')
    await cpv.fetchData()
    console.log('end fetching data')

    console.log('starting to build the import obj')
    await cpv.populateImportObj()
    console.log('end building the import obj')

    console.log('starting to send csv to salesforce files')
    await this.sendToContent(cpv.getCsvObj(cpv.importObjs, 'commerce_product_import.csv'))
    console.log('end sending csv to salesforce files, the content id is: ' + JSON.parse(this.contentVersionResponse).id)

    console.log('starting to send to import api')
    await this.sendToProductApi()
    console.log('end sending to import api, result')
    console.log(this.importApi)

    console.log('process ended')
  }

  async sendToContent(data) {
    this.contentVersionResponse = ''
    return new Promise((resolve, reject) => {
      var options = {
        hostname: this.response.instance_url.replace(/(^\w+:|^)\/\//, ''),
        path: `/services/data/v58.0/sobjects/ContentVersion`,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json; charset=UTF-8',
          Authorization: 'OAuth ' + this.response.access_token
        }
      }

      var req = new https.request(options, res => {
        console.log('send to ContentVersion Api ', res.statusCode)
        this.log.addToLogs([{
            errors: [`Sending to Product API with status code: ${res.statusCode}`],
            success: (req.statusCode > 199 && req.statusCode < 300) ? true : false
          }],
          'ContentVersion http request'
        )
        
        res.setEncoding('utf8')
        res.on('error', (error) => { console.log(error) })
        res.on('data', (chunk) => {

          this.contentVersionResponse += chunk
        })

        res.on('end', () => {
          console.log('called end')
          console.log(this.contentVersionResponse)
          resolve(this.contentVersionResponse)
        })
      })

      req.on('error', function (e) {
        console.log('Error with req', e)
        this.log.addToLogs([{
            errors: [`ERROR_COMMERCE_PRODUCT_CSV_API: ${e}`],
            success: false
          }],
          'ContentVersion other request error'
        )
      })

      req.write(JSON.stringify(data))
      req.end()
    })
  }

  async sendToProductApi() {
    this.importApi = ''
    return new Promise((resolve, reject) => {
      this.importApi = ''

      var options = {
        hostname: this.response.instance_url.replace(/(^\w+:|^)\/\//, ''),
        path: `/services/data/v58.0/commerce/management/webstores/${this.webstoreId}/product-import`,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json; charset=UTF-8',
          Authorization: 'OAuth ' + this.response.access_token
        }
      }

      const importConfigStr = JSON.stringify(new ImportConfiguration(
        JSON.parse(this.contentVersionResponse).id, // contentVersionId,
        this.productCatalogId, // productCatalogId
        this.cmsWorkspaceId, //cmsWorkspaceId
        this.pricebookIds, // pricebookIds
        this.defaultEntitlementPolicyId // defaultEntitlementPolicyId
      ))

      var req = new https.request(options, res => {
        console.log('send to Product Api ', res.statusCode)
        this.log.addToLogs([{
            errors: [`Sending to Product API with status code: ${res.statusCode}`],
            success: (req.statusCode > 199 && req.statusCode < 300) ? true : false
          }],
          'ImportCommerceProduct http request'
        )
        
        res.setEncoding('utf8');
        res.on('error', (error) => { console.log(error) })
        res.on('data', (chunk) => {
          this.importApi += chunk
        })
        res.on('end', () => {
          resolve(this.importApi)
        })
      })

      req.on('error', function (e) {
        console.log('Error with req', e)
        this.log.addToLogs([{
            errors: [`ERROR_COMMERCE_PRODUCT_CSV_API: ${e}`],
            success: false
          }],
          'ImportCommerceProduct other request error'
        )
      })

      req.write(importConfigStr)
      req.end()
    })
  }
}

module.exports = ImportCommerceProduct
