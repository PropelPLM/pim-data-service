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
    this.newAssetList = [];
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
      this.populateNewAssetList();
      this.createNewAssets();
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
  //  this.CDNBaseUrlLabelMap = await this.getCDNBaseUrlLabelMap();
    this.CDNBaseUrlLabelMap = new Map([['https://d3uk1mqqf9h27x.cloudfront.net/', 'aws']]); // TO DELETE, FOR TESTING PURPOSES ONLY
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

  createNewAssets() {
    if (!this.newAssetList.length) {
      return;
    }
    let tempAsset;
    let tempAssetsToInsert = [];
    console.log('reached');
    for (let x = 0; x < this.propelParser.nodes.length; x++) {
      if (
        !this.propelParser.nodes[x].digital_asset_id ||
        !this.newAssetList.includes(this.propelParser.nodes[x].digital_asset_id) ||
        !this.propelParser.nodes[x].cdn_url ||
        !this.isCDNSupported(this.propelParser.nodes[x].cdn_url)
      ) {
        continue;
      }
      console.log('this.propelParser.nodes[x].digital_asset_id: ', this.propelParser.nodes[x].digital_asset_id)
      tempAsset = new Object();
      tempAsset['Name'] = this.propelParser.nodes[x].digital_asset_id;
      tempAsset['Category__c'] = this.categoryMap.get(this.propelParser.nodes[x].category_id);
      tempAsset['Content_Location__c'] =  this.CDNBaseUrlLabelMap.get(this.propelParser.nodes[x].cdn_url);// identifier used to identify CDN
      tempAsset['Mime_Type__c'] = 'bla'; // file type
      tempAsset['Size__c']  = 0; // file size
      tempAsset['View_Link__c'] = ''; //CDN url without the CDN's base url
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
      console.log('tempAsset": ', tempAsset)
    }
  }

  isCDNSupported(url) {
    // url should be {baseUrl}/{pathParameters} e.g. https://d3uk1mqqf9h27x.cloudfront.net/00DHu000001IObVMAW/9adcaab5-966b-4fbf-ba9b-ed716d2ce0cc
    if (url.split('/').length < 3) {
      return;
    }
    // e.g. https:// + d3uk1mqqf9h27x.cloudfront.net/
    const baseUrl = 'https://' + url.split('/')[2];
    console.log('baseUrl: ', baseUrl)
    console.log('this.CDNBaseUrlLabelMap.has(baseUrl): ', this.CDNBaseUrlLabelMap.has(`'${baseUrl}'`))
    return this.CDNBaseUrlLabelMap.has(`'${baseUrl}'`);
  }
}
module.exports = ImportAssetMetadata;
