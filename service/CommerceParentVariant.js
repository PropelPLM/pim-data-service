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
   constructor(helper, pimProductId, alternateCategoryId, mapping, log, options) {
    this.alternateCategoryId = alternateCategoryId
    this.attributes = []
    this.attributeSet
    this.categoryName = ''
    this.contentVersionId
    this.helper = helper
    this.importObjs = []
    this.log = log
    this.mapping = mapping
    this.options = options
    this.pimProductId = pimProductId
    this.pimProducts = []
    this.variants = []
    this.variantValues = []
    this.allVariantValues = []
    this.variantValueMap

    this.init()
  }

  init() {
    this.attributeSet = this.options.attribute_set
  
    if (!this.attributeSet) { console.log('attribute_set was blank') }
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
          Parent_Value_Path__c,
          Parent_Variant_Value__c,
          Variant__r.Name
        from Variant_Value__c
        where Variant__c = '${this.variants[0].Id}'`
      ))

      const categories = await this.helper.connection.queryLimit(this.helper.namespaceQuery(
        `select Id, Name, Category_Id__c from Category__c where Id = '${this.alternateCategoryId}'`
      ))
      this.categoryName = categories[0].Name

      this.allVariantValues = await this.helper.connection.queryLimit(this.helper.namespaceQuery(
        `select
          Id,
          Name,
          Label__c,
          Parent_Variant_Value__c
        from Variant_Value__c
        where Variant__r.Product__c = '${this.pimProductId}'`
      ))

    } catch(error) {
      this.log.addToLogs([{errors: [error] }], 'Fetch_Data')
      console.log(error)
    }
  }

  async buildMaps() {
    this.variantValueMap = new Map(
      this.allVariantValues.map((vv) => {
        return [vv.Id, vv]
      })
    )
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
    tmpObj[`Product ${this.helper.namespace('Product__c')}`] = this.pimProducts[0].Id
    tmpObj[`Product ${this.helper.namespace('SKU_Variant__c')}`] = ''
    tmpObj['Category 1'] = this.categoryName
    tmpObj['ProductCode'] = this.pimProducts[0].Name
    tmpObj['Product isActive'] = true
    tmpObj['SKU'] = this.pimProducts[0].Name
    tmpObj['Variation AttributeSet'] = this.attributeSet
    tmpObj['Variation Parent (StockKeepingUnit)'] = ''

    for (let i = 1; i <= this.variants.length; i++) {
      tmpObj[`Variation Attribute Name ${i}`] = ''
    }

    for (let i = 1; i <= this.variants.length; i++) {
      tmpObj[`Variation Attribute Value ${i}`] = ''
    }

    this.attributes.forEach((attribute) => {

      if (
        this.mapping[attribute[`${this.namespacePlus('Attribute_Label__r.Primary_Key__c')}`]] &&
        !attribute[`${this.helper.namespace('Overwritten_Variant_Value__c')}`]
      ) {
        tmpObj[this.mapping[attribute[`${this.namespacePlus('Attribute_Label__r.Primary_Key__c')}`]]] =
          attribute[`${this.helper.namespace('Value__c')}`]
      }
    })

    // you can remove this iteration after replaceing the csv parser with one that doesn't care about key order
    this.attributes.forEach((attribute) => {

      if (
        this.mapping[attribute[`${this.namespacePlus('Attribute_Label__r.Primary_Key__c')}`]] &&
        attribute[`${this.helper.namespace('Overwritten_Variant_Value__c')}`]
      ) {
        tmpObj[this.mapping[attribute[`${this.namespacePlus('Attribute_Label__r.Primary_Key__c')}`]]] =
          attribute[`${this.helper.namespace('Value__c')}`]
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
    const properOrderVariants = this.variants.reverse()
    
    this.variantValues.forEach((variantValue) => {
      //console.log('what are we doing...' + JSON.stringify(variantValue))
      const tmpObj = {}

      // items to set that are static in the file
      tmpObj[`Product ${this.helper.namespace('Product__c')}`] = this.pimProducts[0].Id
      tmpObj[`Product ${this.helper.namespace('SKU_Variant__c')}`] = variantValue.Id
      tmpObj['Category 1'] = this.categoryName
      tmpObj['ProductCode'] = variantValue.Name
      tmpObj['Product isActive'] = true
      tmpObj['SKU'] = variantValue.Name
      tmpObj['Variation AttributeSet'] = ''
      tmpObj['Variation Parent (StockKeepingUnit)'] = this.pimProducts[0].Name

      for (let i = 0; i < properOrderVariants.length; i++) {
        tmpObj[`Variation Attribute Name ${i + 1}`] = `${properOrderVariants[i].Name}__c`
      }

      const parentVvs = variantValue[`${this.helper.namespace('Parent_Value_Path__c')}`].split(',')
      for (let i = 0; i < properOrderVariants.length - 1; i++) {
        tmpObj[`Variation Attribute Value ${i + 1}`] =
          this.variantValueMap.get(parentVvs[i])[`${this.helper.namespace('Label__c')}`]
      }

      // setting the last variant and it's value
      // I do this because I am only iterating through the lowest level variants, this will always be the lowest level.
      tmpObj[`Variation Attribute Value ${properOrderVariants.length}`] =
        variantValue[`${this.helper.namespace('Label__c')}`]

      // blasting through the first time
      this.attributes.forEach((attribute) => {
  
        if (
          this.mapping[attribute[`${this.namespacePlus('Attribute_Label__r.Primary_Key__c')}`]] &&
          !attribute[`${this.helper.namespace('Overwritten_Variant_Value__c')}`]
        ) {
          tmpObj[this.mapping[attribute[`${this.namespacePlus('Attribute_Label__r.Primary_Key__c')}`]]] =
            attribute[`${this.helper.namespace('Value__c')}`]
        }
      })

      // now blast through for the overwrites
      this.attributes.forEach((attribute) => {
        if (attribute[`${this.helper.namespace('Overwritten_Variant_Value__c')}`] && 
          attribute[`${this.helper.namespace('Overwritten_Variant_Value__c')}`] === variantValue.Id
        ) {
    
          if (this.mapping[attribute[`${this.namespacePlus('Attribute_Label__r.Primary_Key__c')}`]]) {
            tmpObj[this.mapping[attribute[`${this.namespacePlus('Attribute_Label__r.Primary_Key__c')}`]]] =
              attribute[`${this.helper.namespace('Value__c')}`]
          }
        }
      })

      this.importObjs.push(tmpObj)
    })
  }

  // TODO: switch out this csv parser. Need one to use the key to match with the column.
  // needs to support different order of keys in the objects
  getCsvObj(data, filename) {
    const nameOnDisk = `${Date.now()}_${filename}`

    return {
      Title: nameOnDisk,
      PathOnClient: nameOnDisk,
      ContentLocation: 'S',
      VersionData: btoa(convertToCsv(data))
    }
  }

  /**
   * Solving this here for now but need to move this into the propel-sfdc-connect code ASAP
   * only send fields that reference parent custome fields in this function ie Attribute_Label__r.Label__c
   * do not send Attribute_Label__r.Name as the helper.namespace will handle them
   */
  namespacePlus(parentField) {
    let returnField = ''
    if (parentField) {
      const parts = parentField.split('.')

      returnField += `${this.helper.namespaceString}__${parts[0]}`
      returnField += '.'
      returnField += `${this.helper.namespaceString}__${parts[1]}`
    }
    return returnField
  }
}

module.exports = CommerceParentVariant
