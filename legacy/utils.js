var https = require('https');
var fs = require('fs');
const PimExportHelper = require('./PimExportHelper');
const ForceService = require('./ForceService');
const DA_DOWNLOAD_DETAIL_KEY = 'DA_DOWNLOAD_DETAIL_KEY';
const DEFAULT_COLUMNS = new Map([
  ['Record ID', 'Record_ID'], // JUST NAMED THIS COS OF HARDCODE IN PROPEL-DOC-JAVA
  ['Title', 'Title'],
  ['Category Name', 'Category__r.Name']
]);
const PRODUCT_TYPE = 'Product';

class DADownloadDetails {
  static helper;
  constructor(asset, namespace) {
    if (this.helper == null) this.helper = new PimExportHelper(namespace);

    this.fileName = asset.Name;
    this.fileId = this.helper.getValue(asset, 'External_File_Id__c');
    this.key = this.helper.getValue(asset, 'View_Link__c');
    this.mimeType = this.helper.getValue(asset, 'Mime_Type__c');
  }
}

const ATTRIBUTE_FLAG = 'PROPEL_ATT';

logSuccessResponse = (response, functionName) => {
  const logEnding =
    Object.entries(response).length === 0 && response.constructor === Object
      ? ''
      : `: ${JSON.stringify(response)}`;
  console.log(
    `\x1b[92m${functionName} succeeded \x1b[39m with a response${logEnding}.`
  );
  return response;
};

logErrorResponse = (err, functionName) => {
  console.log(
    `\x1b[31m${functionName} failed \x1b[39m due to error: ${JSON.stringify(
      err
    )}.`
  );
  return err;
};

getDigitalAssetMap = async (service, helper) => {
  const digitalAssetList = await service.simpleQuery(
    helper.namespaceQuery(
      `select Id, Name, External_File_Id__c, View_Link__c, Mime_Type__c
      from Digital_Asset__c`
    )
  );
  return new Map(
    digitalAssetList.map(asset => {
      return [asset.Id, asset];
    })
  );
};

initAssetDownloadDetailsList = (
  isProduct,
  includeRecordAsset,
  recordIds,
  digitalAssetMap,
  namespace
) => {
  const daDownloadDetails = [];
  if (isProduct || !includeRecordAsset) return daDownloadDetails;

  recordIds.forEach(recordId => {
    const digitalAsset = digitalAssetMap?.get(recordId);
    if (!digitalAsset) return;
    daDownloadDetails.push(new DADownloadDetails(digitalAsset, namespace));
  });
  return daDownloadDetails;
};

module.exports = {
  callAsposeToExport,
  cleanString,
  getLowestVariantValuesList,
  getDigitalAssetMap,
  getNestedField,
  initAssetDownloadDetailsList,
  logSuccessResponse,
  logErrorResponse,
  parseDigitalAssetAttrVal,
  postToChatter,
  prependCDNToViewLink,
  prepareIdsForSOQL,
  removeFileFromDisk,
  sendConfirmationEmail,
  sendCsvToAsposeCells,
  validateNamespaceForPath,
  validateNamespaceForField,
  DADownloadDetails,
  ATTRIBUTE_FLAG,
  DA_DOWNLOAD_DETAIL_KEY,
  DEFAULT_COLUMNS,
  PRODUCT_TYPE
};
/**
 * Function that send zip file to salesforce chatter via chatter api
 *
 * @param credentials - user credentials authorization
 */
function postToChatter(
  fileName,
  nameOnDisk,
  recordId,
  reqBody,
  errorMessage,
  sendEmail = true,
  callback
) {
  this.reqBody = reqBody;

  const {
    sessionId,
    hostUrl: hostname,
    shouldPostToUser,
    communityId
  } = reqBody;
  let subjectId = shouldPostToUser ? 'me' : recordId;

  // Boundary
  var boundary = 'a7V4kRcFA8E79pivMuV2tukQ85cmNKeoEgJgq';

  var path = '/services/data/v34.0/chatter/feed-elements';
  if (communityId) {
    path = `/services/data/v34.0/connect/communities/${communityId}/chatter/feed-elements`;
  }

  // Options to create the request
  var options = {
    hostname,
    path,
    method: 'POST',
    headers: {
      'Content-Type': errorMessage
        ? 'application/json; charset=UTF-8'
        : 'multipart/form-data; boundary=' + boundary,
      Authorization: 'OAuth ' + sessionId
    }
  };
  // console.log(options)

  var CRLF = '\r\n';
  var errorPostData = [
    '{',
    '"body":{',
    '"messageSegments":[',
    '{',
    '"type":"Text",',
    `"text":${JSON.stringify(errorMessage)}`,
    '}',
    ']',
    '},',
    '"feedElementType":"FeedItem",',
    `"subjectId":"${subjectId}"`,
    '}'
  ].join(CRLF);
  // console.log(errorPostData)
  // Request
  var postData = [
    '--' + boundary,
    'Content-Disposition: form-data; name="json"',
    'Content-Type: application/json; charset=UTF-8',
    '',
    '{',
    '"body":{',
    '"messageSegments":[',
    '{',
    '"type":"Text",',
    '"text":""',
    '}',
    ']',
    '},',
    '"capabilities":{',
    '"content":{',
    `"title":"${fileName}"`,
    '}',
    '},',
    '"feedElementType":"FeedItem",',
    `"subjectId":"${subjectId}"`,
    '}',
    '',
    '--' + boundary,
    `Content-Disposition: form-data; name="feedElementFileUpload"; filename="${fileName}"`,
    'Content-Type: application/octet-stream; charset=ISO-8859-1',
    '',
    ''
  ].join(CRLF);

  // Execute request
  var req = new https.request(options, res => {
    console.log('response: ', res.statusCode, res.statusMessage);
    if (callback) {
      callback();
    }
    if (!errorMessage) {
      // Send confirmation email
      if (sendEmail) {
        sendConfirmationEmail.call(this, res);
      }
    }
    //TODO: send error email?
  });

  // If error show message and finish response
  req.on('error', function (e) {
    console.log(
      'Error in request, please retry or contact your Administrator',
      e
    );
  });

  // write data to request body
  req.write(errorMessage ? errorPostData : postData);
  if (!errorMessage) {
    // Add final boundary and bind request to zip
    fs.createReadStream(nameOnDisk)
      .on('end', function () {
        removeFileFromDisk(nameOnDisk);
        req.end(CRLF + '--' + boundary + '--' + CRLF);
      })
      .pipe(req, { end: false });
  } else {
    req.end();
  }
}

function sendConfirmationEmail(response) {
  const { namespace: ns, hostUrl: hostname, sessionId } = this.reqBody;
  var path = ns
    ? '/services/apexrest/' + ns + '/HerokuAPI/'
    : '/services/apexrest/HerokuAPI/';

  var options = {
    hostname,
    path,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'OAuth ' + sessionId
    }
  };
  // Execute request
  var req = new https.request(options, function (res) {
    console.log('response send email: ', res.statusCode);
  });
  // Request
  var postData =
    '{ "statusCode":"' +
    response.statusCode +
    '", "statusMessage":"' +
    response.statusMessage +
    '"}';
  req.write(postData);
  req.end();
}

function getNestedField(object, field) {
  if (!field) {
    return null;
  }
  if (object === undefined || object === null) {
    return object;
  }

  let lookups = field.split('.');
  let thisField = lookups.shift();
  let nextObject = object[thisField];
  if (lookups.length === 0) {
    return nextObject;
  }
  return getNestedField(nextObject, lookups.join('.'));
}

// Escape special characters for build a clean .CSV file
function cleanString(value) {
  if (value !== undefined && value !== null) {
    value = value.toString();
    let useEnclosingQuotes = value.indexOf(',') > -1;
    if (value.indexOf('"') > 0) {
      value = value.replace(/"/g, '""');
      useEnclosingQuotes = true;
    }
    if (value.indexOf('\n') > -1) {
      useEnclosingQuotes = true;
    }
    if (useEnclosingQuotes) {
      value = `"${value}"`;
    }
    return value;
  }
  return '';
}

function removeFileFromDisk(nameOnDisk) {
  fs.unlink(nameOnDisk, e => {
    if (e) {
      console.log('unlink error:', e);
    }
  });
}

function validateNamespaceForPath(namespace) {
  if (namespace !== '' && namespace !== undefined && namespace !== null) {
    return `${namespace}/`;
  } else {
    return '';
  }
}

function validateNamespaceForField(namespace) {
  if (namespace !== '' && namespace !== undefined && namespace !== null) {
    return `${namespace}__`;
  } else {
    return '';
  }
}

async function prependCDNToViewLink(viewLink, reqBody) {
  const service = new ForceService(reqBody.hostUrl, reqBody.sessionId);
  const helper = new PimExportHelper(reqBody.namespace);
  const CDN_METADATA_NAME = 'CloudfrontDistribution';

  if (viewLink !== null || !viewLink.isEmpty()) {
    const prefix = await service.simpleQuery(
      helper.namespaceQuery(
        `select Id, Value__c
        from Configuration__mdt
        where DeveloperName = '${CDN_METADATA_NAME}'`
      )
    );
    if (prefix.length > 0) {
      return helper.getValue(prefix[0], 'Value__c') + viewLink;
    }
  }
  return viewLink;
}

async function parseDigitalAssetAttrVal(
  digitalAssetMap,
  attrValValue,
  daDownloadDetailsList,
  helper,
  reqBody
) {
  const digitalAsset = digitalAssetMap?.get(attrValValue);
  if (!digitalAsset) return attrValValue;

  daDownloadDetailsList.push(
    new DADownloadDetails(digitalAsset, reqBody.namespace)
  );
  const viewLink = helper.getValue(digitalAsset, 'View_Link__c');
  // if value is already complete url, add it to the map, else prepend the CDN url to the partial url then add to map
  attrValValue = viewLink.includes('https')
    ? viewLink
    : await module.exports.prependCDNToViewLink(viewLink, reqBody);
  return attrValValue;
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

function sendCsvToAsposeCells(csvString, sessionId, hostUrl, templateId) {
  const options = {
    hostname: 'propel-document-java-staging.herokuapp.com',
    path: '/v2/pimTemplateExport',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    }
  };
  let data = JSON.stringify({
    sessionId: sessionId,
    hostUrl: hostUrl,
    templateId: templateId,
    templateFormat: 'csv',
    exportFormat: 'xlsx',
    csvString: csvString
  });
  const req = https
    .request(options, res => {
      let data = '';
      console.log('sendCsvToAsposeCells Status Code:', res.statusCode);
      res.on('data', chunk => {
        data = data + chunk.toString();
      });
      res.on('end', () => {
        console.log(data);
      });
    })
    .on('error', err => {
      console.log('Error: ', err.message);
    });
  req.write(data);
  req.end();
}

async function callAsposeToExport({
  reqBody,
  templateFormat = 'xlsx',
  listPageData,
  detailPageData,
  baseRecord
}) {
  const service = new ForceService(reqBody.hostUrl, reqBody.sessionId);
  const helper = new PimExportHelper(reqBody.namespace);
  const {
    exportFormat,
    hostUrl,
    sessionId,
    templateId,
    templateContentVersionId
  } = reqBody;
  const options = {
    hostname: 'propel-document-java-staging.herokuapp.com',
    path: '/v2/pimTemplateExport',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    }
  };

  let data = {
    sessionId: sessionId,
    hostUrl: hostUrl,
    templateId: templateId,
    templateContentVersionId: templateContentVersionId,
    templateFormat: templateFormat,
    exportFormat: exportFormat
  };

  let exportTypeSpecificInformation;

  if (listPageData) {
    const columnAttributes = await service.simpleQuery(
      helper.namespaceQuery(
        `select Id, Label__c, Primary_Key__c
      from Attribute_Label__c order by Primary_Key__c`
      )
    );
    const labelToPrimaryKeyMap = new Map(
      columnAttributes.map(label => {
        return [
          helper.getValue(label, 'Label__c'),
          helper.getValue(label, 'Primary_Key__c')
        ];
      })
    );
    exportTypeSpecificInformation = {
      defaultColumns: Object.fromEntries(DEFAULT_COLUMNS),
      labelToPrimaryKeyMap: Object.fromEntries(labelToPrimaryKeyMap),
      listPageData: listPageData.map(recordMap => Object.fromEntries(recordMap))
    };
  } else {
    exportTypeSpecificInformation = {
      detailPageData: detailPageData.map(recordMap =>
        Object.fromEntries(recordMap)
      ),
      productVariantValueMap: Object.fromEntries(baseRecord) // JUST NAMED THIS COS OF HARDCODE IN PROPEL-DOC-JAVA
    };
  }
  Object.assign(data, exportTypeSpecificInformation);

  const req = https
    .request(options, res => {
      let data = '';
      console.log('callAsposeToExport Status Code:', res.statusCode);
      res.on('data', chunk => {
        data = data + chunk.toString();
      });
      res.on('end', () => {
        console.log(data);
      });
    })
    .on('error', err => {
      console.log('Error: ', err.message);
    });
  req.write(JSON.stringify(data));
  req.end();
}

// returns a list of the lowest level variant values' ids (i.e. SKUs) from a list of variant values
async function getLowestVariantValuesList(valuesList, namespace) {
  const helper = new PimExportHelper(namespace);
  let parentValueLengthMap = new Map(),
    numOfParentValues,
    highestNumOfParentValues = 0,
    parentValues,
    vvId;
  valuesList.forEach(val => {
    parentValues = helper.getValue(val, 'Parent_Value_Path__c');
    if (parentValues == null) {
      numOfParentValues = 0;
    } else {
      numOfParentValues = parentValues.split(',').length;
    }
    // sort variant values according to their variant level
    vvId = val.Name;
    if (parentValueLengthMap.get(numOfParentValues)) {
      parentValueLengthMap.get(numOfParentValues).push(vvId);
    } else {
      parentValueLengthMap.set(numOfParentValues, [vvId]);
    }
    // update highest tally
    highestNumOfParentValues =
      numOfParentValues > highestNumOfParentValues
        ? numOfParentValues
        : highestNumOfParentValues;
  });
  return parentValueLengthMap.get(highestNumOfParentValues);
}
