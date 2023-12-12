var fs = require('fs');
var crypto = require('crypto');
const https = require('https');
const archiver = require('archiver');
const ReadableStream = require('stream').Readable;

// adding the propel-sfdc-connect package
const propelConnect = require('@propelsoftwaresolutions/propel-sfdc-connect');

const PimStructure = require('./PimStructure');
const {
  cleanString,
  postToChatter,
  postAssetZipFileToChatter,
  logErrorResponse,
  sendCsvToAsposeCells
} = require('./utils');

async function LegacyExportPIM(req) {
  const reqBody = req.body;
  const isListPageExport = reqBody.options.isListPageExport;
  // Create csv string result with records and columns in request body
  if (!reqBody.recordIds.length && !reqBody.variantValueIds.length) {
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

  let daDownloadDetailsList, recordsAndCols, templateAdditionalHeaders;
  try {
    ({ daDownloadDetailsList, recordsAndCols, templateAdditionalHeaders } =
      await new PimStructure().build(reqBody, isListPageExport));
  } catch (err) {
    console.log('error: ', err);
  }

  const baseFileName = createBaseFileName();
  const filename = `${reqBody.recordType}-Export_${baseFileName}.csv`;

  sendDADownloadRequests(
    baseFileName,
    daDownloadDetailsList,
    // reqBody.sessionId,
    // reqBody.hostUrl
    reqBody
  );

  if (!reqBody.includeAttributes) return;
  if (recordsAndCols?.length !== 2) {
    // non CSV template export, exported file will be written to chatter by Aspose
    return;
  }

  let csvString = convertArrayOfObjectsToCSV(
    recordsAndCols[0],
    recordsAndCols[1],
    templateAdditionalHeaders
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

function convertArrayOfObjectsToCSV(
  records,
  columns,
  templateAdditionalHeaders
) {
  let csvStringResult,
    counter,
    keys = [],
    cols = [],
    columnDivider,
    lineDivider,
    recordAttributes;
  // check if "objectRecords" parameter is null, then return from function
  if (
    (records == null || !records.length) &&
    (templateAdditionalHeaders == null || !templateAdditionalHeaders.length)
  ) {
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
  for (let headerRow of templateAdditionalHeaders) {
    csvStringResult += headerRow.join(columnDivider);
    csvStringResult += lineDivider;
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
  reqBody
) {
  if (!daDownloadDetailsList || !daDownloadDetailsList.length) return;
  zipFileName = `Digital_Asset-Export_${zipFileName}.zip`;
  const zipFileNameOnDisk = crypto.randomBytes(20).toString('hex') + zipFileName;
  const output = fs.createWriteStream(zipFileNameOnDisk);
  const archive = archiver('zip', {
    zlib: { level: 9 }
  });
  archive.pipe(output)

  // listen for all archive data to be written
  // 'close' event is fired only when a file descriptor is involved
  output.on('close', function() {
    console.log(archive.pointer() + ' total bytes');
    console.log('archiver has been finalized and the output file descriptor has closed.');
  });

  reqBody.shouldPostToUser = true;
  reqBody.communityId = null;
  let filename, nameOnDisk, fileWriteStream, cdnUrl, fileContent;
  let zipInputStream = new ReadableStream();
  for (let asset of daDownloadDetailsList) {
    filename = asset.fileName
    nameOnDisk = crypto.randomBytes(20).toString('hex') + filename;
    fileWriteStream = fs.createWriteStream(nameOnDisk);
    cdnUrl = asset.key;

    fileContent = Buffer.alloc(0);
    https.get(cdnUrl, (response) => {
      response.on('data', (chunk) => {
        fileContent = Buffer.concat([fileContent, chunk]);
      });
  
      // response.on('end', () => {
      //   fileWriteStream.write(fileContent, () => {
      //     try {
      //       postToChatter(filename, nameOnDisk, '', reqBody);
      //     } catch (err) {
      //       console.log('error: ', err);
      //     }
      //   })
      //   console.log('File downloaded successfully.');
      // });
      response.on('end', () => {
        try {
          zipInputStream.push(fileContent);
          archive.append(zipInputStream, { name: filename });
          archive.on('finish', () => {
            postToChatter(zipFileName, zipFileNameOnDisk, '', reqBody);
          });
          archive.finalize();
          console.log('File zipped successfully.');
        } catch (err) {
          console.log('error: ', err);
        }
      });
    }).on('error', (error) => {
      console.error('Download failed:', error.message);
    });
  }
}

module.exports = LegacyExportPIM;
