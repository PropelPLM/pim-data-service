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
    this.categoryMap = new Map();
    this.existingAssetMap = new Map();
    this.newAssetMetadataMap = new Map();
    this.labelNameIdMap = new Map();
    this.assetLabelValueMap;
    this.tempAssetsToUpdate = [];
    this.tempAttrValuesToUpdate = [];
    this.tempAttrValuesToInsert =[];
    this.CDNBaseUrlLabelMap = new Map();

    this.start();
  }

  async start() {
    await this.connect();

    if (this.propelParser.nodes && this.propelParser.nodes.length) {
      this.populateAssetNames();
      this.populateLabelNames();
      await this.populateLabelNameIdMap();
      await this.populateCategoryMap();
      await this.populateExistingAssetMap();
      await this.populateDigitalAssetAttributeValues();
      await this.updateExistingAssets();
      await this.populateCDNBaseUrlLabelMap();
      await this.populateNewAssetList();
      await this.createNewAssets();
    }

    // finish up
    await this.log.sendReport();
  }

  populateAssetNames() {
    try {
      for (let node of this.propelParser.nodes) {
        if (!node.digital_asset_id || !node.digital_asset_id.length) {
          throw new Error('Import aborted: digital_asset_id column is missing or has missing values');
        }
        this.assetNames.push(`'${node.digital_asset_id}'`);
      }
    } catch (error) {
      this.log.addToLogs([{errors: [error] }], this.helper.namespace('Digital_Asset__c'));
      console.log(error);
    }
  }

  populateLabelNames() {
    Object.keys(this.propelParser.nodes[0]).forEach((header) => {
      if (header !== 'digital_asset_id' && header !== 'category_id' && header !== 'cdn_url') {
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
      ...this.assetNames,
      ...this.parentNames
    ]);
    await pimAssets.populate();
    this.existingAssetMap = pimAssets.getNameMap();
  }

  async populateDigitalAssetAttributeValues() {
    if (!this.labelNames.length) {
      return;
    }
    const pimAttributeValue = new PimAttributeValue(this.helper, this.log, []);
    await pimAttributeValue.populateWithDigitalAssetValues(
      prepareIdsForSOQL(Array.from(this.existingAssetMap.values())), 
      this.labelNames
    );
    this.assetLabelValueMap = pimAttributeValue.sortAccordingToDigitalAssetAndLabel();
  }

  async updateExistingAssets() {
    try {
      for (let x = 0; x < this.propelParser.nodes.length; x++) {
        if (
          this.propelParser.nodes[x].digital_asset_id &&
          this.existingAssetMap.has(this.propelParser.nodes[x].digital_asset_id)
        ) {
          const assetSObjectId = this.existingAssetMap.get(this.propelParser.nodes[x].digital_asset_id);
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
    if (!parserNode.category_id || !this.categoryMap.has(parserNode.category_id)) {
      return;
    }
    let tempAsset = new Object();
    tempAsset['Id'] = assetSObjectId;
    tempAsset[this.helper.namespace('Category__c')] = this.categoryMap.get(parserNode.category_id);
    this.tempAssetsToUpdate.push(tempAsset);
  }

  createTempAttributeValueObjects(label, assetSObjectId, value) {
    let tempAttrVal = new Object();
    tempAttrVal['Value__c'] = value;
    if (this.assetLabelValueMap.has(assetSObjectId) && this.assetLabelValueMap.get(assetSObjectId).has(label)) {
      // update existing attribute value
      tempAttrVal['Id'] = this.assetLabelValueMap.get(assetSObjectId).get(label)
      this.tempAttrValuesToUpdate.push(tempAttrVal);
    } else {
      // create new attribute value
      tempAttrVal['Digital_Asset__c'] = assetSObjectId;
      tempAttrVal['Attribute_Label__c'] = this.labelNameIdMap.get(label);
      this.tempAttrValuesToInsert.push(tempAttrVal);
    }
  }

  /** Gets a Map of <CDN base url, CDN label> that we support. Note CDN label will be used as identifier in Digital_Asset__r.Content_Location__c */
  async populateCDNBaseUrlLabelMap() {
    this.CDNBaseUrlLabelMap = await this.getCDNBaseUrlLabelMap();
  }  

  // store a list of asset names for assets that dont exist in PIM
  async populateNewAssetList() {
    for (let x = 0; x < this.propelParser.nodes.length; x++) {
      if (!this.propelParser.nodes[x].digital_asset_id ||
        this.existingAssetMap.has(this.propelParser.nodes[x].digital_asset_id) ||
        !this.propelParser.nodes[x].cdn_url ||
        !this.isCDNSupported(this.propelParser.nodes[x].cdn_url)) {
          continue;
        }
      this.newAssetMetadataMap.set(
        this.propelParser.nodes[x].digital_asset_id, 
        await this.getAssetSizeAndType(this.propelParser.nodes[x].cdn_url)
      );
    }
  }

  async createNewAssets() {
    if (!this.newAssetMetadataMap.size) {
      return;
    }
    let tempAsset;
    let tempAssetsToInsert = [];
    for (let x = 0; x < this.propelParser.nodes.length; x++) {
      const assetName = this.propelParser.nodes[x].digital_asset_id;
      if (!this.newAssetMetadataMap.has(assetName)) {
        continue;
      }

      tempAsset = new Object();
      tempAsset['Name'] = assetName;
      tempAsset['Category__c'] = this.categoryMap.get(this.propelParser.nodes[x].category_id);
      tempAsset['External_File_Id__c'] = 'N.A.';
      tempAsset['Content_Location__c'] = this.CDNBaseUrlLabelMap.get(
        this.getBaseUrlFromCDNUrl(this.propelParser.nodes[x].cdn_url)
      );
      if (this.newAssetMetadataMap.get(assetName) && this.newAssetMetadataMap.get(assetName).mimeType) {
        tempAsset['Mime_Type__c'] = this.newAssetMetadataMap.get(assetName).mimeType;
      }
      if (this.newAssetMetadataMap.get(assetName) && this.newAssetMetadataMap.get(assetName).assetSize) {
        tempAsset['Size__c'] = Number(this.newAssetMetadataMap.get(assetName).assetSize);
      }
      tempAsset['View_Link__c'] = '';
      for (let i = 0; i < this.propelParser.nodes[x].cdn_url.split('/').length; i++) {  
        if (i < 3) {
          // skip baseUrl e.g. https://d3uk1mqqf9h27x.cloudfront.net/
          continue;
        }
        if (i != 3) {
          tempAsset['View_Link__c'] += '/';
        }
        tempAsset['View_Link__c'] += this.propelParser.nodes[x].cdn_url.split('/')[i];
      }
      tempAssetsToInsert.push(tempAsset);
    }
    let results = await this.connection.insert(
      this.helper.namespace('Digital_Asset__c'), tempAssetsToInsert
    );
    this.log.addToLogs(results, this.helper.namespace('Digital_Asset__c'));
  }

  isCDNSupported(url) {
    // url should be {baseUrl}/{pathParameters} e.g. https://d3uk1mqqf9h27x.cloudfront.net/00DHu000001IObVMAW/9adcaab5-966b-4fbf-ba9b-ed716d2ce0cc
    if (url.split('/').length < 3) {
      return false;
    }
    // e.g. https:// + d3uk1mqqf9h27x.cloudfront.net/
    const baseUrl = this.getBaseUrlFromCDNUrl(url);
    return this.CDNBaseUrlLabelMap.has(baseUrl);
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

  getBaseUrlFromCDNUrl(url) {
    try {
      if (url.split('/').length < 3) {
        throw new Error('invalid CDN url, did you omit the https:// at the start?');
      }
      return 'https://' + url.split('/')[2] + '/';
    } catch (error) {
      this.log.addToLogs([{errors: [error] }], this.helper.namespace('Digital_Asset__c'));
      console.log(error);
    }
  }
}
module.exports = ImportAssetMetadata;
