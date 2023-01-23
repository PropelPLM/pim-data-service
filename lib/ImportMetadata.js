const propelConnect = require('@propelsoftwaresolutions/propel-sfdc-connect')

class ImportMetadata {

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
      sessionId
    } = req.body

    this.batchsize = batchsize
    this.categoryMap
    this.data = data
    this.namespace = namespace
    this.orgId = orgId
    this.options = options

    this.connection = propelConnect.newConnection(hostUrl, sessionId)
    this.propelParser = propelConnect.newParser(this.data)
    this.helper = propelConnect.newHelper(this.connection, {}, this.namespace, {})
    this.log = propelConnect.newLog(this.connection)

    this.start()
  }

  async start() {
  
    await this.propelParser.parseCsv()
  }
}

module.exports = ImportMetadata
