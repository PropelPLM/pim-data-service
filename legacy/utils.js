var http = require('https');
var fs = require('fs');
const PimExportHelper = require('./PimExportHelper');
const ForceService = require('./ForceService');
const DA_DOWNLOAD_DETAIL_KEY = 'DA_DOWNLOAD_DETAIL_KEY';

class DADownloadDetails {
  static helper;
  constructor(asset, namespace) {
    if (this.helper == null) this.helper = new PimExportHelper(namespace);

    this.fileName = asset.Name;
    this.fileId = this.helper.getValue(asset, 'External_File_Id__c');
    this.key = this.helper.getValue(asset, 'View_Link__c');
  }
}

const ATTRIBUTE_FLAG = 'PROPEL_ATT';

module.exports = {
  postToChatter,
  getNestedField,
  sendConfirmationEmail,
  cleanString,
  prepareIdsForSOQL,
  removeFileFromDisk,
  validateNamespaceForPath,
  validateNamespaceForField,
  prependCDNToViewLink,
  parseDigitalAssetAttrVal,
  DADownloadDetails,
  ATTRIBUTE_FLAG,
  DA_DOWNLOAD_DETAIL_KEY
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
  var req = new http.request(options, res => {
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
  var req = new http.request(options, function (res) {
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
  if (!Array.isArray(idList)) {
    idList = Array.from(idList);
  }

  return idList.map(id => `'${id}'`).join(',');
}
