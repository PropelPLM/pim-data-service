const propelConnect = require('@propelsoftwaresolutions/propel-sfdc-connect')
const PimAttribute = require('../service/PimAttribute')
const PimAttributeLabel = require('../service/PimAttributeLabel')
const PimCategory = require('../service/PimCategory')
const PimProduct = require('../service/PimProduct')
const PimVariantValue = require('../service/PimVariantValue')
const parse = require('csv-parser')

class ImportProduct {

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
    } = req.body

    this.attributeExemptList = [
      'category',
      'highest_level_product_id',
      'parent_id',
      'product_id',
      'v_level'
    ]

    this.batchsize = batchsize
    this.categoryIdMap
    this.data = data
    this.namespace = namespace
    this.nodes = []
    this.nodeMap = new Map()
    this.nodeMapLevelZero = new Map()
    this.orgId = orgId
    this.options = options
    this.productAttributeMap
    this.productMap
    this.productHasVariantMap
    this.variantValueMap

    this.connection = propelConnect.newConnection(hostUrl, sessionId)
    this.helper = propelConnect.newHelper(this.connection, {}, this.namespace, {})
    this.log = propelConnect.newLog(this.connection, this.orgId)

    this.start()
  }

  async start() {
    
    await this.parseCsv()

    this.createNodeMap()
    
    // needed to check on the products in the org
    await this.populateProductMap()
    await this.populateCategoryMap()
    // now insert any new products
    await this.insertProducts()

    // populate all the maps needed
    await this.populateProductMap()
    await this.populateAttributeLabelMap()
    await this.populateProductAttributeMap()
    await this.populateVariantValueMap()

    // the workhorse
    await this.processLevelZero()
    await this.processVariants()

    // refresh category maps for newly created variants
    await this.populateCategoryMap()
    await this.populateProductMap()

    // continue with processing.
    await this.processVariantValues()
    // need to refresh these maps
    await this.populateVariantValueMap()

    // finish up with updating Variant Values and Overrides
    await this.processVariantValueUpdates()
    await this.processVariantOverrides()

    // finish up
    await this.log.sendReport()
  }

  // TODO: there is an issue here, some columns are displaying in the console like this: 'on-model_images': '', with single quotes in the objects key. 
  // I think it's because there is a hyphen in these columns and there are other with more than one underscore.
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

  createNodeMap() {
    this.nodes.forEach(node => {
      if (!this.nodeMap.has(node.v_level)) {
        this.nodeMap.set(node.v_level, new Array(node))
      } else {
        let tempArray = this.nodeMap.get(node.v_level)
        tempArray.push(node)
        this.nodeMap.set(node.v_level, tempArray)
      }

      // level zero node map
      if (node.v_level === '0') {
        this.nodeMapLevelZero[node.product_id] = node
      }
    })
  }

  async populateAttributeLabelMap() {
    const pimAttributeLabel = new PimAttributeLabel(this.helper, this.log)
    await pimAttributeLabel.populate()
    this.attributeLabelMap = pimAttributeLabel.getNameMap()
  }

  async populateCategoryMap() {
    const pimCategory = new PimCategory(this.helper, this.log)
    await pimCategory.populate()
    this.categoryHasVariantMap = new Map()
    this.categoryIdMap = new Map()
    this.categoryIdMap = pimCategory.getIdMap()
  }

  async populateProductMap() {
    const pimProduct = new PimProduct(this.helper, this.log)
    await pimProduct.populate()
    this.productMap = new Map()
    this.productMap = pimProduct.getNameMap()
    this.productHasVariantMap = new Map()
    this.productHasVariantMap = pimProduct.getHasVariantMap()
  }

  async populateProductAttributeMap() {
    const productNames = new Array()
    if (this.nodeMap.has('0')) {
      this.nodeMap.get('0').forEach(record => {
        productNames.push(`'${record.product_id}'`)
      })
    } else {
      this.log.addToLogs(
        [{errors: ['nodeMap did not contain level zero values.']}],
        this.namespace + 'Product__c'
      )
    }
    const pimAttribute = new PimAttribute(this.helper, this.log, productNames)
    await pimAttribute.populate()
    this.productAttributeMap = pimAttribute.getNameMap()
  }

  /**
   * got to start at the begining. Used to create all the highest level products.
   */
  async populateVariantValueMap() {
    const variantNames = new Array()
    this.nodes.forEach(node => {
      variantNames.push(`'${node.product_id}'`)
    })
    const pimVariantValue = new PimVariantValue(
      this.helper,
      this.log,
      variantNames
    )
    await pimVariantValue.populate()
    this.variantValueMap = new Map()
    this.variantValueMap = pimVariantValue.getNameMap()
  }

  async insertProducts() {
    const insertProducts = new Array()
    let tmpProduct

    if (this.nodeMap.has('0')) {
      this.nodeMap.get('0').forEach(node => {
        if (!this.productMap.has(node.product_id)) {
          tmpProduct = new Object()
          tmpProduct.Name = node.product_id
          tmpProduct[this.helper.namespace('Category__c')] =
            this.categoryIdMap.has(node.category_id) ?
            this.categoryIdMap.get(node.category_id) :
            '' // need to figure out about a default category
          
          insertProducts.push(tmpProduct)
        }
      })
    }

    if (insertProducts.length > 0) {
      let results = await this.connection.insert(this.helper.namespace('Product__c'), insertProducts)
      this.log.addToLogs(results, 'Product__c')
    }
  }

  /**
   * used to grab all the level 0 products and create attributes or update attributes
   */
  async processLevelZero() {
    const insertAttributes = new Array()
    const updateAttributes = new Array()
    let tmpAttribute

    if (this.nodeMap.has('0')) {
      this.nodeMap.get('0').forEach(node => {
        if (this.productMap.has(node.product_id)) {
          Object.keys(node).forEach(key => {

            // check to see if the column is an attribute
            if (!this.attributeExemptList.includes(key) && this.attributeLabelMap.has(key) && node[key]) {
              tmpAttribute = new Object()
              tmpAttribute[this.helper.namespace('Value__c')] = node[key]
              
              if (this.productAttributeMap.has(node.product_id + key)) {
                
                tmpAttribute['Id'] = this.productAttributeMap.get(node.product_id + key).Id

                updateAttributes.push(tmpAttribute)
              } else {
                tmpAttribute[this.helper.namespace('Attribute_Label__c')] = this.attributeLabelMap.get(key)
                tmpAttribute[this.helper.namespace('Product__c')] = this.productMap.get(node.product_id)
                
                insertAttributes.push(tmpAttribute)
              }

            }
          })
        }
      })
    }

    if (insertAttributes.length > 0) {
      let results = await this.connection.insert(this.helper.namespace('Attribute_Value__c'), insertAttributes)
      this.log.addToLogs(results, 'Attribute__c')
    }

    if (updateAttributes.length > 0) {
      let results = await this.connection.update(this.helper.namespace('Attribute_Value__c'), updateAttributes)
      this.log.addToLogs(results, 'Attribute__c')
    }
  }

  /**
   * this function is adding all the variants in the correct order to the Category
   */
  async processVariants() {
    const insertVariants = new Array()
    let tmpVariant

    if (this.nodeMap.has('0')) {
      this.nodeMap.get('0').forEach(node => {
 
        // since this is Product Import I am not checking for Variants on the product if it is already a product in PIM
        Object.keys(node).forEach(key => {
          if (key.startsWith('variant_') && node[key]) {
            tmpVariant = new Object()
            tmpVariant.Name = node[key]
            //tmpVariant[this.helper.namespace('Category__c')] = this.categoryIdMap.get(node.category_id)
            tmpVariant[this.helper.namespace('Product__c')] = this.productMap.get(node.product_id)
            tmpVariant[this.helper.namespace('Order__c')] = parseInt(key.substring(8)) + 1

            insertVariants.push(tmpVariant)
          }
        })
      })
    }

    if (insertVariants.length > 0) {
      let results = await this.connection.insert(this.helper.namespace('Variant__c'), insertVariants)
      this.log.addToLogs(results, 'Variant__c')
    }
  }

  /**
   * used to go through the file and for non-level 0 rows create Variant Values
   */
  async processVariantValues() {
    const insertVariantValues = new Array()
    let tmpVariantValue
    let tmpVariantId

    for (const mapKey of this.nodeMap.keys()) {
      if (mapKey !== '0') {
        this.nodeMap.get(mapKey).forEach(node => {

          if (!this.variantValueMap.has(node.product_id)) {
            Object.keys(node).forEach(key => {
              if (key.startsWith('variant_') && node[key]) {

                tmpVariantValue = new Object()
                tmpVariantValue.Name = node.product_id
                tmpVariantValue[this.helper.namespace('Label__c')] = node[key]

                this.productHasVariantMap.get(node.highest_level_product_id).records.forEach(variant => {
                  if (variant.Name === this.nodeMapLevelZero[node.highest_level_product_id][key]) {
                    tmpVariantId = variant.Id
                  }
                })
                tmpVariantValue[this.helper.namespace('Variant__c')] = tmpVariantId

                insertVariantValues.push(tmpVariantValue)
              }
            })
          }
        })
      }
    }

    if (insertVariantValues.length > 0) {
      let results = await this.connection.insert(this.helper.namespace('Variant_Value__c'), insertVariantValues)
      this.log.addToLogs(results, 'Variant_Value__c')
    }
  }

  /**
   * Used to take all the newly created Variant Values and update them with their
   * Variant Value hierarchy. Adding Parent_Variant_Value__c to the Variant Values 
   */
  async processVariantValueUpdates() {
    const updateVariantValues = new Array()
    let tmpVariantValue

    for (const mapKey of this.nodeMap.keys()) {
      if (mapKey !== '0') {
        this.nodeMap.get(mapKey).forEach(node => {
          if (this.variantValueMap.has(node.product_id) && this.variantValueMap.has(node.parent_id)) {
            tmpVariantValue = new Object()
            tmpVariantValue.Id = this.variantValueMap.get(node.product_id)
            tmpVariantValue[this.helper.namespace('Parent_Variant_Value__c')] = this.variantValueMap.get(node.parent_id)

            updateVariantValues.push(tmpVariantValue)
          }
        })

        if (updateVariantValues.length > 0) {
          let results = await this.connection.update(this.helper.namespace('Variant_Value__c'), updateVariantValues)
          this.log.addToLogs(results, 'Variant_Value__c')
        }
      }
    }
  }

  /**
   * Used to go through the file one last time and add all the Attribute Values
   * with Variant Overrides if there are overrides
   */
  async processVariantOverrides() {
    const insertAttributes = new Array()
    const updateAttributes = new Array()
    let tmpAttribute

    for (const mapKey of this.nodeMap.keys()) {
      if (mapKey !== '0') {
        this.nodeMap.get(mapKey).forEach(node => {
          Object.keys(node).forEach(key => {
            if (
              !key.startsWith('variant_') &&
              !this.attributeExemptList.includes(key) &&
              this.attributeLabelMap.has(key) &&
              node[key]
            ) {

              tmpAttribute = new Object()
              tmpAttribute[this.helper.namespace('Value__c')] = node[key]
              
              if (this.productAttributeMap.has(node.product_id + key)) {
                
                tmpAttribute['Id'] = this.productAttributeMap.get(node.product_id + key).Id

                updateAttributes.push(tmpAttribute)
              } else {

                tmpAttribute[this.helper.namespace('Attribute_Label__c')] = this.attributeLabelMap.get(key)
                tmpAttribute[this.helper.namespace('Product__c')] = this.productMap.get(node.highest_level_product_id)
                tmpAttribute[this.helper.namespace('Overwritten_Variant_Value__c')] =
                  this.variantValueMap.get(node.product_id)
                
                insertAttributes.push(tmpAttribute)
              }
            }
          })
        })
      }
    }

    if (insertAttributes.length > 0) {
      let results = await this.connection.insert(this.helper.namespace('Attribute_Value__c'), insertAttributes)
      this.log.addToLogs(
        results,
        'Attribute_Value__c'
      )
    }

    if (updateAttributes.length > 0) {
      let results = await this.connection.update(this.helper.namespace('Attribute_Value__c'), updateAttributes)
      this.log.addToLogs(results, 'Attribute_Value__c')
    }
  }
}

module.exports = ImportProduct
