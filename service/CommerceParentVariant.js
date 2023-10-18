const PimProductDeep = require('./PimProductDeep')
const { convertToCsv } = require('../lib/utility');

var fs = require('fs')
var https = require('https')

class CommerceParentVariant {

   /**
   * @param {PropelHelper} helper
   * @param {String} pimProductId
   * @param {String} mapping
   * @param {PropelLog} log
   */
   constructor(helper, pimProductId, alternateCategoryId, mapping, log, response) {
    this.pimProducts = []
    this.helper = helper
    this.mapping = mapping
    this.contentVersionId
    this.pimProductId = pimProductId
    this.log = log
    this.alternateCategoryId = alternateCategoryId
    this.categoryName = ''
    this.response = response
    this.attributes = []
    this.variants = []
    this.variantValues = []
    this.importObjs = []
    this.variantValueParents = []
  }

  async fetchData() {
    try {
      this.pimProducts = await this.helper.connection.queryLimit(this.helper.namespaceQuery(
        `select Id, Name from Product__c where Id = '${this.pimProductId}'`
      ))

      this.attributes = await this.helper.connection.queryLimit(this.helper.namespaceQuery(
        `select 
          Id,
          Name,
          Attribute_Label__c,
          Attribute_Label__r.Attribute_Group__r.Name,
          Attribute_Label__r.Attribute_Group__r.Attribute_Tab__r.Name,
          Attribute_Label__r.Label__c,
          Attribute_Label__r.Mandatory__c,
          Attribute_Label__r.Primary_Key__c,
          Attribute_Label__r.Type__c,
          Overwritten_Variant_Value__c,
          Overwritten_Variant_Value__r.Label__c,
          Overwritten_Variant_Value__r.Name,
          Overwritten_Variant_Value__r.Parent_Value_Path__c,
          Value__c
        from Attribute_Value__c where Product__c = '${this.pimProductId}'`
      ))

      this.variants = await this.helper.connection.queryLimit(this.helper.namespaceQuery(
        `select Id, Name from Variant__c where Product__c = '${this.pimProductId}' Order By Order__c desc`
      ))

      this.variantValues = await this.helper.connection.queryLimit(this.helper.namespaceQuery(
        `select
          Id,
          Name,
          Label__c,
          Parent_Variant_Value__c,
          Variant__r.Name
        from Variant_Value__c
        where Variant__c = '${this.variants[0].Id}'`
      ))

      this.variantValueParents = await this.helper.connection.queryLimit(this.helper.namespaceQuery(
        `select
          Id,
          Name,
          Label__c,
          Parent_Variant_Value__c,
          Variant__r.Name
        from Variant_Value__c
        where Variant__c = '${this.variants[1].Id}'` // this is totally stupid
      ))

      const categories = await this.helper.connection.queryLimit(this.helper.namespaceQuery(
        `select Id, Name, Category_Id__c from Category__c where Id = '${this.alternateCategoryId}'`
      ))
      this.categoryName = categories[0].Name

    } catch(error) {
      this.log.addToLogs([{errors: [error] }], this.helper.namespace('Category__c'))
    }
  }

  /**
   * function to go through all the attributes and create an object to convert to a
   * csv. Special case for Product Name and Title. PimProduct Title goes to Product2 Name
   * and PimProduct Name goes to Product2 ProductCode.
   */
  async populateImportObj() {
    const tmpObj = {}
    // first we build the first data row, the parent

    // items to set that are static in the file
    tmpObj['Category 1'] = this.categoryName
    tmpObj['ProductCode'] = this.pimProducts[0].Name
    tmpObj['Product isActive'] = true
    tmpObj['SKU'] = this.pimProducts[0].Name
    tmpObj['Variation AttributeSet'] = 'General_Set' // need to set this dynamically but for now...
    tmpObj['Variation Parent (StockKeepingUnit)'] = ''

    // these need to be set dynamically but for now...
    tmpObj['Variation Attribute Name 1'] = ''
    tmpObj['Variation Attribute Name 2'] = ''
    tmpObj['Variation Attribute Value 1'] = ''
    tmpObj['Variation Attribute Value 2'] = ''

    this.attributes.forEach((attribute) => {

      if (
        this.mapping[attribute['Attribute_Label__r.Primary_Key__c']] &&
        !attribute['Overwritten_Variant_Value__c']
      ) {
        tmpObj[this.mapping[attribute['Attribute_Label__r.Primary_Key__c']]] = attribute['Value__c']
      }
    })

    this.importObjs.push(tmpObj)

    // add variants
    await this.populateVariantsObj()
  }

  /**
   * function to go through all the variants
   */
  async populateVariantsObj() {
    const vvParentMap = this.getparentVvMap()
    
    this.variantValues.forEach((variantValue) => {
      //console.log('what are we doing...' + JSON.stringify(variantValue))
      const tmpObj = {}

      // items to set that are static in the file
      tmpObj['Category 1'] = this.categoryName
      tmpObj['ProductCode'] = variantValue.Name
      tmpObj['Product isActive'] = true
      tmpObj['SKU'] = variantValue.Name
      tmpObj['Variation AttributeSet'] = ''
      tmpObj['Variation Parent (StockKeepingUnit)'] = this.pimProducts[0].Name

      // these need to be set dynamically but for now...
      tmpObj['Variation Attribute Name 1'] = 'Color__c'
      tmpObj['Variation Attribute Name 2'] = 'Size__c'

      tmpObj['Variation Attribute Value 1'] =
        vvParentMap.has(variantValue['Parent_Variant_Value__c'])
          ? vvParentMap.get(variantValue['Parent_Variant_Value__c'])['Label__c']
          : ''
      tmpObj['Variation Attribute Value 2'] = variantValue['Label__c']

      // blasting through the first time
      this.attributes.forEach((attribute) => {
  
        if (
          this.mapping[attribute['Attribute_Label__r.Primary_Key__c']] &&
          !attribute['Overwritten_Variant_Value__c']
        ) {
          tmpObj[this.mapping[attribute['Attribute_Label__r.Primary_Key__c']]] = attribute['Value__c']
        }
      })

      // now blast through for the overwrites
      this.attributes.forEach((attribute) => {
        if (attribute['Overwritten_Variant_Value__c'] && attribute['Overwritten_Variant_Value__c'] === variantValue.Id) {

          // special case just to get the title
          if (attribute['Attribute_Label__r.Label__c'] === 'Title') {
            tmpObj['Product Name'] = attribute['Value__c']
          }
    
          if (this.mapping[attribute['Attribute_Label__r.Primary_Key__c']]) {
            tmpObj[this.mapping[attribute['Attribute_Label__r.Primary_Key__c']]] = attribute['Value__c']
          }
        }
      })

      this.importObjs.push(tmpObj)
    })
  }

  getCsvObj(data, filename) {
    const nameOnDisk = `${Date.now()}_${filename}`

    return {
      Title: nameOnDisk,
      PathOnClient: nameOnDisk,
      ContentLocation: 'S',
      VersionData: btoa(convertToCsv(data))
    }
  }
  
  getparentVvMap() {
    return new Map(
      this.variantValueParents.map((vv) => {
        return [vv.Id, vv]
      })
    )
  }
}

module.exports = CommerceParentVariant
