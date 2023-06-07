var fs = require('fs');
var crypto = require('crypto');
const https = require('https');

// adding the propel-sfdc-connect package
const propelConnect = require('@propelsoftwaresolutions/propel-sfdc-connect');

const PimStructure = require('./PimStructure');
const {
  cleanString,
  postToChatter,
  logErrorResponse,
  sendCsvToAsposeCells
} = require('./utils');

async function LegacyExportPIM(req) {
  const reqBody = req.body;
  const isListPageExport = reqBody.options.isListPageExport;
  // Create csv string result with records and columns in request body
  if (reqBody.recordIds.length == 0) {
    return 'Error';
  }

  // highjacking the flow here are inserting the session id from the JWT flow
  const response = await propelConnect.jwtSession({
    clientId: process.env.PIM_DATA_SERVICE_CLIENT_ID,
    isTest: reqBody.isTest,
    privateKey: process.env.PIM_DATA_SERVICE_KEY,
    user: reqBody.user
  });
  reqBody.sessionId = response.access_token;
  if (!reqBody.sessionId) {
    return 'Error - no session id';
  }

  let daDownloadDetailsList, recordsAndCols;
  try {
    ({ daDownloadDetailsList, recordsAndCols } = await new PimStructure().build(
      reqBody,
      isListPageExport
    ));
  } catch (err) {
    console.log('error: ', err);
  }

  const baseFileName = createBaseFileName();
  const filename = `${reqBody.recordType}-Export_${baseFileName}.csv`;

  sendDADownloadRequests(
    baseFileName,
    daDownloadDetailsList,
    reqBody.sessionId,
    reqBody.hostUrl
  );

  if (!reqBody.includeAttributes) return;
  if (recordsAndCols?.length !== 2) {
    // non CSV template export, exported file will be written to chatter by Aspose
    return;
  }

  let csvString = convertArrayOfObjectsToCSV(
    recordsAndCols[0],
    recordsAndCols[1]
  );
  if (csvString == null) {
    logErrorResponse('csvString is empty!', '[ExportPIM]');
    return;
  }

  if (reqBody.exportFormat == 'csv') {
    // CSV -> CSV export (both template and non-template)
    const nameOnDisk = crypto.randomBytes(20).toString('hex') + filename;
    const file = fs.createWriteStream(nameOnDisk);
    reqBody.shouldPostToUser = true;
    reqBody.communityId = null;
    file.write(csvString, () => {
      try {
        postToChatter(filename, nameOnDisk, reqBody.recordIds[0], reqBody);
      } catch (err) {
        console.log('error: ', err);
      }
    });
  } else if (reqBody.exportFormat == 'xlsx') {
    // CSV -> XLSX export OR XLSX non template export
    sendCsvToAsposeCells(
      csvString,
      reqBody.sessionId,
      reqBody.hostUrl,
      reqBody.templateId
    );
  }
  return csvString;
}

function convertArrayOfObjectsToCSV(records, columns) {
  let csvStringResult,
    counter,
    keys = [],
    cols = [],
    columnDivider,
    lineDivider,
    recordAttributes;
  // check if "objectRecords" parameter is null, then return from function
  if (records == null || !records.length) {
    return null;
  }
  // store ,[comma] in columnDivider variable for separate CSV values and
  // for start next line use '\n' [new line] in lineDivider variable
  columnDivider = ',';
  lineDivider = '\n';

  // in the keys valirable store fields API Names as a key
  // this labels use in CSV file header
  columns.forEach(col => {
    if (col.fieldName) {
      if (col.fieldName === 'ProductLink') {
        keys.push(col.typeAttributes.label.fieldName);
        cols.push(col.label);
      } else {
        keys.push(col.fieldName.replace(/URL$/g, ''));
        cols.push(col.label);
      }
    }
  });
  console.log('keys: ', keys);
  console.log('cols: ', cols);
  csvStringResult = '';
  const headerRows = ['bla1, bla2'];
  for (let headerRow of headerRows) {
    csvStringResult += headerRow.join(columnDivider);
  }
  csvStringResult += cols.join(columnDivider);
  csvStringResult += lineDivider;
  for (let i = 0; i < records.length; i++) {
    counter = 0;
    // eslint-disable-next-line guard-for-in
    for (let sTempkey in keys) {
      let skey = keys[sTempkey];
      // add , [comma] after every String value,. [except first]
      if (counter > 0) {
        csvStringResult += columnDivider;
      }
      recordAttributes = records[i];
      if (
        records[i].get(skey) != null &&
        typeof records[i].get(skey) == 'object'
      ) {
        recordAttributes.set(skey, recordAttributes.get(skey).Name);
      }
      csvStringResult += cleanString(records[i].get(skey) || '');

      counter++;
    }
    csvStringResult += lineDivider;
  }
  return csvStringResult;
}

function createBaseFileName() {
  let date = new Date();
  const year = date.getFullYear();
  const month = ('0' + (date.getMonth() + 1)).slice(-2);
  const day = ('0' + date.getDate()).slice(-2);
  const hour = ('0' + date.getHours()).slice(-2);
  const minutes = ('0' + date.getMinutes()).slice(-2);
  const seconds = ('0' + date.getSeconds()).slice(-2);

  return year + '-' + month + '-' + day + '_' + hour + minutes + seconds;
}

async function sendDADownloadRequests(
  zipFileName,
  daDownloadDetailsList,
  sessionId,
  hostName
) {
  if (!daDownloadDetailsList || !daDownloadDetailsList.length) return;
  zipFileName = `Digital_Asset-Export_${zipFileName}.zip`;

  const payload = JSON.stringify({
    platform: 'aws',
    zipFileName,
    daDownloadDetailsList,
    hostName,
    sessionId,
    salesforceUrl: hostName
  });
  const options = {
    hostname: 'cloud-doc-stateless.herokuapp.com',
    path: '/platform/files/download/',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(payload)
    }
  };
  const request = https.request(options, res => {
    let data = '';
    res.on('data', chunk => {
      data = data + chunk.toString();
    });
    res.on('end', () => {
      console.log(data);
    });
  });
  request.write(payload);
  request.end();
  console.log('Payload sent: ', payload);
}

module.exports = LegacyExportPIM;
