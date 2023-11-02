const ImportClass = require('./ImportClass');
const PimAsset = require('../service/PimAsset');
const PimCategory = require('../service/PimCategory');

class ImportAssetMetadata extends ImportClass {
  /**
   * @param {HttpRequest} req
   * @param {HttpResponse} res
   */
  constructor(req, res) {
    super(req, res);

    this.assetNames = [];
    this.parentNames = [];
    this.labelNames = [];
    // this.productMap = new Map()
    // this.variantValueMap = new Map()
    // this.labelMap = new Map()
    this.categoryMap = new Map();
    this.existingAssetMap = new Map();
    this.newAssetList = [];
    // this.valueMap = new Map()
    // this.attributeValues = []

    this.start();
  }

  async start() {
    await this.connect();

    // this.ns = {
    //   'Attribute_Value__c': this.helper.namespace('Attribute_Value__c'),
    //   'Attribute_Label__c': this.helper.namespace('Attribute_Label__c'),
    //   'Digital_Asset__c': this.helper.namespace('Digital_Asset__c'),
    //   'Product__c': this.helper.namespace('Product__c'),
    //   'Overwritten_Variant_Value__c': this.helper.namespace('Overwritten_Variant_Value__c'),
    //   'Value__c': this.helper.namespace('Value__c'),
    // }

    this.populateRelatedNames();
    await this.populateCategoryMap();
    await this.populateExistingAssetMap();
    await this.updateExistingAssets();
    this.populateNewAssetList();

    // finish up
    await this.log.sendReport();
  }

  populateRelatedNames() {
    this.propelParser.nodes.forEach(node => {
      this.assetNames.push(`'${node.digital_asset_id}'`);
    });
  }

  async populateCategoryMap() {
    const pimCategory = new PimCategory(this.helper, this.log);
    await pimCategory.populate();
    this.categoryMap = pimCategory.getIdMap();
    console.log('this.categorymap: ', this.categoryMap);
  }

  // get a Map of <Digital Asset Name => Digital_Asset__c Id> for assets that already exist in PIM
  async populateExistingAssetMap() {
    const pimAssets = new PimAsset(this.helper, this.log, [
      ...this.assetNames,
      ...this.parentNames
    ]);
    await pimAssets.populate();
    this.existingAssetMap = pimAssets.getNameMap();
    console.log('this.existingAssetMap: ', this.existingAssetMap);
  }

  async updateExistingAssets() {
    let tempAsset;

    for (let x = 0; x < this.propelParser.nodes.length; x++) {
      // update existing digital assets
      console.log('this.propelParser.nodes[x].digital_asset_id: ', this.propelParser.nodes[x].digital_asset_id);
      if (
        this.propelParser.nodes[x].digital_asset_id &&
        this.existingAssetMap.has(this.propelParser.nodes[x].digital_asset_id)
      ) {
        console.log('if')
        tempAsset = new Object();
        tempAsset[this.helper.namespace('Category__c')] = this.categoryMap.get(
          this.propelParser.nodes[x].category_id
        );

        let results = await this.connection.upsert(
          this.helper.namespace('Digital_Asset__c'),
          new Array(tempAsset)
        );

        this.log.addToLogs(results, this.helper.namespace('Digital_Asset__c'));

        // await this.populateCategoryMap()
      }
    }
  }

  // store a list of asset names for assets that dont exist in PIM
  populateNewAssetList() {
    this.assetNames.forEach(assetName => {
      if (!this.existingAssetMap.has(assetName)) {
        this.newAssetList.push(assetName);
      }
    });
    console.log('this.newAssetList: ', this.newAssetList);
  }
}
module.exports = ImportAssetMetadata;
