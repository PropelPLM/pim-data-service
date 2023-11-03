const XLSX = require('xlsx')
const { jwtSession, newParser } = require('@propelsoftwaresolutions/propel-sfdc-connect')

function convertDataByType(data, type) {
  let returnData = Buffer.from(data, 'base64')
  if (type == 'xlsx') {
    const wb = XLSX.read(returnData, { type: "buffer" });
    const ws = wb.Sheets[wb.SheetNames[0]];
    returnData = XLSX.utils.sheet_to_csv(ws, { forceQuotes: true })
  } else {
    returnData = returnData.toString()
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

function convertToCsv(arr) {
  const array = [Object.keys(arr[0])].concat(arr)

  return array.map(it => {
    return Object.values(it).toString()
  }).join('\n')
}

function prepareIdsForSOQL(idList) {
  const emptyRes = "''";
  try {
    if (!Array.isArray(idList)) {
      idList = Array.from(idList);
    }
    if (idList.length == 0) return emptyRes;
    if (idList[0].constructor === Object)
      idList = idList.map(ele => ele.Id ?? ele.id);

    return idList.length ? idList.map(id => `'${id}'`).join(',') : emptyRes;
  } catch (err) {
    throw new Error(`Cannot get list of Ids for query from input: ${idList}`);
  }
}

module.exports = {
  convertDataByType,
  getSessionId,
  convertToCsv,
  prepareIdsForSOQL
}
