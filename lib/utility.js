const XLSX = require('xlsx')
const { jwtSession, newParser } = require('@propelsoftwaresolutions/propel-sfdc-connect')

function convertDataByType(data, type) {
  let returnData = data
  if (type == 'xlsx') {
    const wb = XLSX.read(Buffer.from(returnData, 'base64'), { type: "buffer" });
    const ws = wb.Sheets[wb.SheetNames[0]];
    returnData = XLSX.utils.sheet_to_csv(ws, { forceQuotes: true })
  }
  return newParser(returnData)
}

async function getSessionId(request) {
  const response = await jwtSession({
    clientId: process.env.PIM_DATA_SERVICE_CLIENT_ID,
    isTest: request.isTest,
    privateKey: process.env.PIM_DATA_SERVICE_KEY.replace(/\\n/g, '\n'),
    user: request.user
  })
  return response;
}

module.exports.convertDataByType = convertDataByType
module.exports.getSessionId = getSessionId
