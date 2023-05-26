const propelConnect = require('@propelsoftwaresolutions/propel-sfdc-connect')
const { convertDataByType, getSessionId } = require('./utility')

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
}


module.exports = ImportClass
