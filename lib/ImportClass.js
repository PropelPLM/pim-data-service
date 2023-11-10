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

  /** calls APEX REST API to get an convert to javascript Map of supported <CDN Base Url, Label> */
  async getCDNBaseUrlLabelMap() {
    try {
      let service = new ForceService(this.response.instance_url, this.response.access_token);
      const stringifiedCDNBaseUrlLabelMap = await service.getCDNBaseUrlLabelMap();
      return new Map(Object.entries(JSON.parse(stringifiedCDNBaseUrlLabelMap)));
    } catch (error) {
      this.log.addToLogs([{errors: [error] }], this.helper.namespace('Digital_Asset__c'));
      console.log(error);
    }
  }
}

module.exports = ImportClass
