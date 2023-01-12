var fs = require('fs');
var crypto = require('crypto');
const https = require('https');

const PimStructure = require('./PimStructure');
const { postToChatter } = require('./utils');

async function LegacyExportPIM(req) {
  const reqBody = req.body;
  const isListPageExport = reqBody.options.isListPageExport;
  // Create csv string result with records and columns in request body
  if (reqBody.recordIds.length == 0) {
    return 'Error';
  }
  let daDownloadDetailsList, recordsAndCols;
  try {
    ({daDownloadDetailsList, recordsAndCols} = await PimStructure(reqBody, isListPageExport));
  } catch (err) {
    console.log('error: ', err);
  }

  const baseFileName = createBaseFileName();
  const filename = `Product-Export_${baseFileName}.csv`;

  sendDADownloadRequests(baseFileName, daDownloadDetailsList, reqBody.sessionId, reqBody.hostUrl);

  let csvString = convertArrayOfObjectsToCSV(
    recordsAndCols[0],
    recordsAndCols[1]
  );
  if (csvString == null) {
    return 'Error';
  }

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

  return csvString;
}

function convertArrayOfObjectsToCSV(records, columns) {
  let csvStringResult,
    counter,
    keys = [],
    cols = [],
    columnDivider,
    lineDivider;
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
  csvStringResult = '';
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
      if (
        records[i].get(skey) != null &&
        typeof records[i].get(skey) == 'object'
      ) {
        records[i].get(skey) = records[i].get(skey).Name;
      }
      csvStringResult += escapeString(records[i].get(skey) || '');

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

  return year +
    '-' +
    month +
    '-' +
    day +
    '_' +
    hour +
    minutes +
    seconds;
}

async function sendDADownloadRequests(zipFileName, daDownloadDetailsList, sessionId, hostName) {
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
      'Content-Length': Buffer.byteLength(payload),
    }
  };
  const request = https.request(options, (res) => {
    console.log({res})
  });
  request.write(payload);
  request.end();
  console.log('Payload sent: ', payload);
}

function escapeString(str) {
  // check for fields which actually contain a quote, newline or comma char, need to protect those
  str = str.toString() ? str.toString() : '';
  let useEnclosingQuotes = str.indexOf(',') > -1;
  if (str.indexOf('"') > 0) {
    str = str.replace(/['"']/g, '""');
    useEnclosingQuotes = true;
  }
  if (str.indexOf('\n') > -1) {
    useEnclosingQuotes = true;
  }
  if (useEnclosingQuotes) {
    str = '"' + str + '"';
  }
  return str;
}

module.exports = LegacyExportPIM;
