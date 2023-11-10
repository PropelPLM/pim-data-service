const propelConnect = require('@propelsoftwaresolutions/propel-sfdc-connect')
const { convertDataByType, getSessionId } = require('./utility')
const ForceService = require('../legacy/ForceService');

class ImportClass {

  /**
   * @param {HttpRequest} req
   * @param {HttpResponse} res
   */
  constructor(req, res) {
    const {
      batchsize,
      data,
      dataType,
      isTest,
      namespace,
      options,
      orgId,
      user
    } = req.body

    this.batchsize = batchsize
    this.data = data
    this.dataType = dataType
    this.isTest = isTest
    this.namespace = namespace
    this.orgId = orgId
    this.options = options
    this.res = res
    this.user = user

    this.connection
    this.propelParser = convertDataByType(this.data, this.dataType)
    this.helper
    this.log

  }

  async connect() {
    this.response = await getSessionId({
      isTest: this.isTest,
      user: this.user,
    })

    this.connection = propelConnect.newConnection(
      this.response.instance_url,
      this.response.access_token
    )
    this.helper = propelConnect.newHelper(this.connection, {}, this.namespace, {})
    this.log = propelConnect.newLog(this.connection)

    await this.propelParser.parseCsv()
  }

  async getCDNBaseUrlLabelMap() {
    try {
      let service = new ForceService(this.response.instance_url, this.response.access_token);
      const jsonCDNBaseUrlLabelMap = await service.getCDNBaseUrlLabelMap();
      console.log('jsonCDNBaseUrlLabelMap: ', jsonCDNBaseUrlLabelMap)
      console.log('JSON.parse(jsonCDNBaseUrlLabelMap): ', JSON.parse(jsonCDNBaseUrlLabelMap))
      console.log('jsonCDNBaseUrlLabelMap["https://www.google.com"]: ', jsonCDNBaseUrlLabelMap["https://www.google.com"])
      console.log('new Map(Object.entries(jsonCDNBaseUrlLabelMap)): ', new Map(Object.entries(jsonCDNBaseUrlLabelMap)))
      return new Map(Object.entries(jsonCDNBaseUrlLabelMap));
    } catch (error) {
      this.log.addToLogs([{errors: [error] }], this.helper.namespace('Digital_Asset__c'));
      console.log(error);
    }
  }
}

module.exports = ImportClass
