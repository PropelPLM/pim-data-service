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

    this.existingAssetNames = [];
    this.parentNames = [];
    this.labelNames = [];
    this.categoryMap = new Map();
    this.existingAssetIdMap = new Map();
    this.newAssetMetadataMap = new Map();
    this.labelNameIdMap = new Map();
    this.assetLabelValueMap;
    this.tempAssetsToUpdate = [];
    this.tempAttrValuesToUpdate = [];
    this.tempAttrValuesToInsert =[];
    this.newAssetIdMap = new Map();

    this.start();
  }

  async start() {
    try {
      await this.connect();
  
      if (this.propelParser.nodes && this.propelParser.nodes.length) {
        this.populateAssetNames();
        this.populateLabelNames();
        await this.populateLabelNameIdMap();
        await this.populateCategoryMap();
        await this.populateExistingAssetMap();
        await this.populateDigitalAssetAttributeValues(this.existingAssetIdMap);
        await this.updateExistingAssetsAttributeValues();
        await this.populateNewAssetList();
        await this.createNewAssets();
        await this.populateNewAssetMap();
        await this.populateDigitalAssetAttributeValues(this.newAssetIdMap);
        await this.updateNewAssetsAttributeValues();
      }
  
      // finish up
      await this.log.sendReport();
    } catch (error) {
      console.error(error);
    }
  }

  populateAssetNames() {
    try {
      for (let node of this.propelParser.nodes) {
        if (!node['Digital Asset Record'] || !node['Digital Asset Record'].length) {
          throw new Error('Import aborted: digital_asset_id column is missing or has missing values');
        }
        this.existingAssetNames.push(`'${node['Digital Asset Record']}'`);
      }
    } catch (error) {
      this.log.addToLogs([{errors: [error] }], this.helper.namespace('Digital_Asset__c'));
      console.log(error);
    }
  }

  populateLabelNames() {
    Object.keys(this.propelParser.nodes[0]).forEach((header) => {
      if (header !== 'Digital Asset Record' && header !== 'Category ID' && header !== 'CDN_URL') {
        this.labelNames.push(`'${header}'`);
      }
    });
  }

  async populateLabelNameIdMap() {
    if (!this.labelNames.length) {
      return;
    }
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
      ...this.existingAssetNames,
      ...this.parentNames
    ]);
    await pimAssets.populate();
    this.existingAssetIdMap = pimAssets.getNameMap();
  }

  async populateDigitalAssetAttributeValues(assetIdMap) {
    if (!this.labelNames.length) {
      return;
    }
    const pimAttributeValue = new PimAttributeValue(this.helper, this.log, []);
    await pimAttributeValue.populateWithDigitalAssetValues(
      prepareIdsForSOQL(Array.from(assetIdMap.values())), 
      this.labelNames
    );
    this.assetLabelValueMap = pimAttributeValue.sortAccordingToDigitalAssetAndLabel();
  }

  async updateExistingAssetsAttributeValues() {
    try {
      for (let x = 0; x < this.propelParser.nodes.length; x++) {
        if (
          this.propelParser.nodes[x]['Digital Asset Record'] &&
          this.existingAssetIdMap.has(this.propelParser.nodes[x]['Digital Asset Record'])
        ) {
          const assetSObjectId = this.existingAssetIdMap.get(this.propelParser.nodes[x]['Digital Asset Record']);
          this.updateAssetCategory(assetSObjectId, this.propelParser.nodes[x]);
          
          this.labelNames.forEach((label) => {
            label = label.slice(1, -1);
            this.createTempAttributeValueObjects(label, assetSObjectId, this.propelParser.nodes[x][label]);
          });
        }
      }
      let results = await this.connection.update(this.helper.namespace('Digital_Asset__c'), this.tempAssetsToUpdate);
      this.log.addToLogs(results, this.helper.namespace('Digital_Asset__c'));

      results = await this.connection.update(
        this.helper.namespace('Attribute_Value__c'), this.tempAttrValuesToUpdate
      );
      this.log.addToLogs(results, this.helper.namespace('Attribute_Value__c'));

      results = await this.connection.insert(
        this.helper.namespace('Attribute_Value__c'), this.tempAttrValuesToInsert
      );
      this.log.addToLogs(results, this.helper.namespace('Attribute_Value__c'));
    } catch (error) {
      this.log.addToLogs([{errors: [error] }], this.helper.namespace('Digital_Asset__c'));
      console.log(error);
    }
  }

  updateAssetCategory(assetSObjectId, parserNode) {
    if (!parserNode['Category ID'] || !this.categoryMap.has(parserNode['Category ID'])) {
      return;
    }
    let tempAsset = new Object();
    tempAsset['Id'] = assetSObjectId;
    tempAsset[this.helper.namespace('Category__c')] = this.categoryMap.get(parserNode['Category ID']);
    this.tempAssetsToUpdate.push(tempAsset);
  }

  createTempAttributeValueObjects(label, assetSObjectId, value) {
    let tempAttrVal = new Object();
    tempAttrVal[this.helper.namespace('Value__c')] = value;
    if (this.assetLabelValueMap.has(assetSObjectId) && this.assetLabelValueMap.get(assetSObjectId).has(label)) {
      // update existing attribute value
      tempAttrVal['Id'] = this.assetLabelValueMap.get(assetSObjectId).get(label)
      this.tempAttrValuesToUpdate.push(tempAttrVal);
    } else {
      // create new attribute value
      tempAttrVal[this.helper.namespace('Digital_Asset__c')] = assetSObjectId;
      tempAttrVal[this.helper.namespace('Attribute_Label__c')] = this.labelNameIdMap.get(label);
      this.tempAttrValuesToInsert.push(tempAttrVal);
    }
  }

  // store a list of asset names for assets that dont exist in PIM
  async populateNewAssetList() {
    for (let x = 0; x < this.propelParser.nodes.length; x++) {
      if (
        !this.propelParser.nodes[x]['Digital Asset Record'] ||
        this.existingAssetIdMap.has(this.propelParser.nodes[x]['Digital Asset Record']) ||
        !this.propelParser.nodes[x].CDN_URL
      ) {
        continue;
      }
      this.newAssetMetadataMap.set(
        this.propelParser.nodes[x]['Digital Asset Record'], 
        await this.getAssetSizeAndType(this.propelParser.nodes[x].CDN_URL)
      );
    }
  }

  async getAssetSizeAndType(url) {
    return new Promise(function (resolve, reject) {
      let request = require("request");
      request({
          url: url,
          method: "HEAD"
      }, function(err, response, body) {
          if (response.headers) {
            resolve({ 
              mimeType: response.headers['content-type'],
              assetSize: response.headers['content-length']
            });
          } else {
            reject(err);
          }
      });
    });
  }

  async createNewAssets() {
    if (!this.newAssetMetadataMap.size) {
      return;
    }
    let tempAsset;
    let tempAssetsToInsert = [];
    for (let x = 0; x < this.propelParser.nodes.length; x++) {
      const assetName = this.propelParser.nodes[x]['Digital Asset Record'];
      if (!this.newAssetMetadataMap.has(assetName)) {
        continue;
      }

      tempAsset = new Object();
      tempAsset['Name'] = assetName;
      tempAsset[this.helper.namespace('Category__c')] = this.categoryMap.get(this.propelParser.nodes[x]['Category ID']);
      tempAsset[this.helper.namespace('External_File_Id__c')] = 'N.A.';
      tempAsset[this.helper.namespace('Content_Location__c')] = 'N.A.';
      if (this.newAssetMetadataMap.get(assetName) && this.newAssetMetadataMap.get(assetName).mimeType) {
        tempAsset[this.helper.namespace('Mime_Type__c')] = this.newAssetMetadataMap.get(assetName).mimeType;
      }
      if (this.newAssetMetadataMap.get(assetName) && this.newAssetMetadataMap.get(assetName).assetSize) {
        tempAsset[this.helper.namespace('Size__c')] = Number(this.newAssetMetadataMap.get(assetName).assetSize);
      }
      tempAsset[this.helper.namespace('View_Link__c')] = this.propelParser.nodes[x].CDN_URL;
      tempAssetsToInsert.push(tempAsset);
    }
    let results = await this.connection.insert(
      this.helper.namespace('Digital_Asset__c'), tempAssetsToInsert
    );
    this.log.addToLogs(results, this.helper.namespace('Digital_Asset__c'));
  }

  async populateNewAssetMap() {
    if (!this.newAssetMetadataMap.size) {
      return;
    }
    let newAssetNames = Array.from(this.newAssetMetadataMap.keys()).map((name) => `'${name}'`);
    const pimAssets = new PimAsset(this.helper, this.log, [
      ...newAssetNames,
      ...this.parentNames
    ]);
    await pimAssets.populate();
    this.newAssetIdMap = pimAssets.getNameMap();
  }

  async updateNewAssetsAttributeValues() {
    try {
      this.tempAttrValuesToInsert = [];
      for (let x = 0; x < this.propelParser.nodes.length; x++) {
        if (
          !this.propelParser.nodes[x]['Digital Asset Record'] ||
          !this.newAssetMetadataMap.has(this.propelParser.nodes[x]['Digital Asset Record'])
        ) {
          continue;
        }
        const assetSObjectId = this.newAssetIdMap.get(this.propelParser.nodes[x]['Digital Asset Record']);
        this.labelNames.forEach((label) => {
          label = label.slice(1, -1);
          this.createTempAttributeValueObjects(label, assetSObjectId, this.propelParser.nodes[x][label]);
        });
      }
      let results = await this.connection.insert(
        this.helper.namespace('Attribute_Value__c'), this.tempAttrValuesToInsert
      );
      this.log.addToLogs(results, this.helper.namespace('Attribute_Value__c'));
    } catch (error) {
      this.log.addToLogs([{errors: [error] }], this.helper.namespace('Digital_Asset__c'));
      console.log(error);
    }
  }
}
module.exports = ImportAssetMetadata;
