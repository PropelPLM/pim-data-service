const ImportClass = require('./ImportClass');
const PimAsset = require('../service/PimAsset');
const PimCategory = require('../service/PimCategory');
const PimAttributeValue = require('../service/PimAttributeValue');
const PimAttributeLabel = require('../service/PimAttributeLabel');
const { prepareIdsForSOQL } = require('./utility');

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
    this.labelNameIdMap = new Map();
    this.assetLabelValueMap;

    this.start();
  }

  async start() {
    await this.connect();

    if (this.propelParser.nodes && this.propelParser.nodes.length > 0) {
      this.populateAssetNames();
      this.populateLabelNames();
      await this.populateLabelNameIdMap();
      await this.populateCategoryMap();
      await this.populateExistingAssetMap();
      await this.populateDigitalAssetAttributeValues();
      await this.updateExistingAssets();
      this.populateNewAssetList();
    }

    // finish up
    await this.log.sendReport();
  }

  populateAssetNames() {
    this.propelParser.nodes.forEach(node => {
      this.assetNames.push(`'${node.digital_asset_id}'`);
    });
  }

  populateLabelNames() {
    Object.keys(this.propelParser.nodes[0]).forEach((header) => {
      if (header !== 'digital_asset_id' && header !== 'category_id' && header !== 'cdn_url') {
        this.labelNames.push(`'${header}'`);
      }
    });
  }

  async populateLabelNameIdMap() {
    const pimAttributeLabel = new PimAttributeLabel(this.helper, this.log, this.labelNames);
    await pimAttributeLabel.populate('Label__c');
    this.labelNameIdMap = pimAttributeLabel.getNameMap();
  }

  async populateCategoryMap() {
    const pimCategory = new PimCategory(this.helper, this.log);
    await pimCategory.populate();
    this.categoryMap = pimCategory.getIdMap();
  }

  // get a Map of <Digital Asset Name => Digital_Asset__c Id> for assets that already exist in PIM
  async populateExistingAssetMap() {
    const pimAssets = new PimAsset(this.helper, this.log, [
      ...this.assetNames,
      ...this.parentNames
    ]);
    await pimAssets.populate();
    this.existingAssetMap = pimAssets.getNameMap();
  }

  async populateDigitalAssetAttributeValues() {
    const pimAttributeValue = new PimAttributeValue(this.helper, this.log, []);
    await pimAttributeValue.populateWithDigitalAssetValues(prepareIdsForSOQL(Array.from(this.existingAssetMap.values())), this.labelNames);
    this.assetLabelValueMap = pimAttributeValue.sortAccordingToDigitalAssetAndLabel();
    console.log('this.assetLabelValueMap: ', this.assetLabelValueMap)
  }

  async updateExistingAssets() {
    let tempAsset;

    for (let x = 0; x < this.propelParser.nodes.length; x++) {
      // update existing digital assets
      if (
        this.propelParser.nodes[x].digital_asset_id &&
        this.existingAssetMap.has(this.propelParser.nodes[x].digital_asset_id)
      ) {
        const assetSObjectId = this.existingAssetMap.get(this.propelParser.nodes[x].digital_asset_id);
        tempAsset = new Object();
        tempAsset['Id'] = assetSObjectId;
        tempAsset[this.helper.namespace('Category__c')] = this.categoryMap.get(
          this.propelParser.nodes[x].category_id
        );

        let results = await this.connection.update(
          this.helper.namespace('Digital_Asset__c'),
          new Array(tempAsset)
        );

        this.log.addToLogs(results, this.helper.namespace('Digital_Asset__c'));
        
        let tempAttrValuesToUpdate = [];
        let tempAttrValuesToInsert = [];
        let tempAttrVal;
        this.labelNames.forEach((label) => {
          label = label.slice(1, -1);
          if (this.assetLabelValueMap.has(assetSObjectId) && this.assetLabelValueMap.get(assetSObjectId).has(label)) {
            // update existing attribute value
            tempAttrVal = new Object();
            tempAttrVal['Id'] = this.assetLabelValueMap.get(assetSObjectId).get(label)
            tempAttrVal['Value__c'] = this.propelParser.nodes[x][label];
            tempAttrValuesToUpdate.push(tempAttrVal);
            console.log('tempAttrVal1: ', tempAttrVal)
          } else {
            // create new attribute value
            tempAttrVal = new Object();
            tempAttrVal['Digital_Asset__c'] = assetSObjectId;
            console.log('this.labelNameIdMap: ', this.labelNameIdMap)
            tempAttrVal['Attribute_Label__c'] = this.labelNameIdMap.get(label);
            tempAttrVal['Value__c'] = this.propelParser.nodes[x][label];
            tempAttrValuesToInsert.push(tempAttrVal);
            console.log('tempAttrVal2: ', tempAttrVal)
          }
        });
      }
    }
  }

  // store a list of asset names for assets that dont exist in PIM
  populateNewAssetList() {
    this.assetNames.forEach(assetName => {
      assetName = assetName.slice(1, -1);
      if (!this.existingAssetMap.has(assetName)) {
        this.newAssetList.push(assetName);
      }
    });
  }
}
module.exports = ImportAssetMetadata;
