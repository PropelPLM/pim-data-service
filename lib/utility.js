const { jwtSession } = require('@propelsoftwaresolutions/propel-sfdc-connect')

async function getSessionId(request) {
  const response = await jwtSession({
    clientId: request.clientId,
    isTest: request.isTest,
    privateKey: process.env.PIM_DATA_SERVICE_KEY.replace(/\\n/g, '\n'),
    user: request.user
  })
  return response;
}

module.exports.getSessionId = getSessionId
