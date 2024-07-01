const ImportClass = require('./ImportClass')
const PimAsset = require('../service/PimAsset')
const PimProduct = require('../service/PimProduct')
const PimVariantValue = require('../service/PimVariantValue')
const PimAttributeLabel = require('../service/PimAttributeLabel')
const PimAttributeValueByParent = require('../service/PimAttributeValueByParent')

class ImportAssetLink extends ImportClass {

  /**
   * @param {HttpRequest} req
   * @param {HttpResponse} res
   */
  constructor(req, res) {
    super(req, res)

    this.assetNames = []
    this.parentNames = []
    this.labelNames = []
    this.productMap = new Map()
    this.variantValueMap = new Map()
    this.labelMap = new Map()
    this.assetMap = new Map()
    this.valueMap = new Map()
    this.attributeValues = []

    this.start()
  }

  async start() {
    try {
      await this.connect();
  
      this.ns = {
        'Attribute_Value__c': this.helper.namespace('Attribute_Value__c'),
        'Attribute_Label__c': this.helper.namespace('Attribute_Label__c'),
        'Digital_Asset__c': this.helper.namespace('Digital_Asset__c'),
        'Product__c': this.helper.namespace('Product__c'),
        'Overwritten_Variant_Value__c': this.helper.namespace('Overwritten_Variant_Value__c'),
        'Value__c': this.helper.namespace('Value__c'),
      }
  
      this.populateRelatedNames()
      await this.populateParentMap();
      await this.populateAttributeLabelMap();
      await this.populateAssetMap();
      await this.populateExistingLinkMap();
      await this.processLineByLine();
  
      // finish up
      await this.log.sendReport();
    } catch (error) {
      console.error(error);
    }
  }

  populateRelatedNames() {
    this.propelParser.nodes.forEach((node) => {
      this.assetNames.push(`'${node.digital_asset_id}'`)
      this.parentNames.push(`'${node.product_id}'`)
      this.labelNames.push(`'${node.attribute_name}'`)
    })
  }

  async populateParentMap() {
    const pimProduct = new PimProduct(this.helper, this.log, this.parentNames, true)
    await pimProduct.populate()
    this.productMap = pimProduct.getNameMap()
    const pimVariantValue = new PimVariantValue(this.helper, this.log, this.parentNames)
    await pimVariantValue.populate()
    this.variantValueMap = pimVariantValue.getNameMap()
  }

  async populateAttributeLabelMap() {
    const pimLabels = new PimAttributeLabel(this.helper, this.log, this.labelNames)
    await pimLabels.populate('Primary_Key__c')
    this.labelMap = pimLabels.getPrimaryKeyIdMap()
  }

  async populateAssetMap() {
    const pimAssets = new PimAsset(this.helper, this.log, [...this.assetNames, ...this.parentNames])
    await pimAssets.populate()
    this.assetMap = pimAssets.getNameMap()
  }

  async populateExistingLinkMap() {
    const pimAttributeValueLink = new PimAttributeValueByParent(this.helper, this.log, this.parentNames)
    await pimAttributeValueLink.populate()
    this.valueMap = pimAttributeValueLink.getNameMap()
  }

  async processLineByLine() {
    let assetId, parentAssetId, productId, vValueId, labelId
    this.propelParser.nodes.forEach((node) => {
      assetId = this.assetMap.get(node.digital_asset_id)
      parentAssetId = this.assetMap.get(node.product_id)
      productId = this.productMap.get(node.product_id)
      vValueId = this.variantValueMap.get(node.product_id)
      labelId = this.labelMap.get(node.attribute_name)

      if (assetId && (productId || vValueId) && labelId) {
        this.attributeValues.push({
          Id: this.valueMap.get(node.product_id + node.attribute_name),
          [this.ns.Attribute_Label__c]: labelId,
          [this.ns.Digital_Asset__c]: parentAssetId,
          [this.ns.Overwritten_Variant_Value__c]: vValueId,
          [this.ns.Product__c]: productId,
          [this.ns.Value__c]: assetId,
        })
      }
    })

    let results = await this.connection.upsert(
      this.ns.Attribute_Value__c,
      'Id',
      this.attributeValues
    )
    this.log.addToLogs(results, this.helper.namespace('Attribute_Value__c'))
  }
}

module.exports = ImportAssetLink
