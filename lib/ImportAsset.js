class ImportAsset extends ImportClass {
    /**
   * @param {HttpRequest} req
   * @param {HttpResponse} res
   */
  constructor(req, res) {
    super(req, res)

    // this.assetNames = []
    // this.parentNames = []
    // this.labelNames = []
    // this.productMap = new Map()
    // this.variantValueMap = new Map()
    // this.labelMap = new Map()
    this.assetMap = new Map();
    // this.valueMap = new Map()
    // this.attributeValues = []

    this.start()
  }

  async start() {
    await this.connect()

    // this.ns = {
    //   'Attribute_Value__c': this.helper.namespace('Attribute_Value__c'),
    //   'Attribute_Label__c': this.helper.namespace('Attribute_Label__c'),
    //   'Digital_Asset__c': this.helper.namespace('Digital_Asset__c'),
    //   'Product__c': this.helper.namespace('Product__c'),
    //   'Overwritten_Variant_Value__c': this.helper.namespace('Overwritten_Variant_Value__c'),
    //   'Value__c': this.helper.namespace('Value__c'),
    // }

    await this.populateAssetMap()

    // finish up
    await this.log.sendReport()
  }

  async populateAssetMap() {
    const pimAssets = new PimAsset(this.helper, this.log, [...this.assetNames, ...this.parentNames]);
    await pimAssets.populate();
    this.assetMap = pimAssets.getNameMap();
    console.log('this.assetMap: ', this.assetMap);
  }
}