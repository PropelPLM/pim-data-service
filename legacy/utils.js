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
      `select Id, Name, External_File_Id__c, View_Link__c, Mime_Type__c, Content_Location__c
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
  getLowestVariantsFromProducts,
  getLowestVariantValuesList,
  getDigitalAssetMap,
  getNestedField,
  initAssetDownloadDetailsList,
  logSuccessResponse,
  logErrorResponse,
  parseDigitalAssetAttrVal,
  parseDaAttrValWithVarMap,
  postToChatter,
  prependCDNToViewLink,
  prepareIdsForSOQL,
  removeFileFromDisk,
  sendConfirmationEmail,
  sendCsvToAsposeCells,
  validateNamespaceForPath,
  validateNamespaceForField,
  DADownloadDetails,
  parseProductReferenceAttrVal,
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
function cleanString(str) {
  // check for fields which actually contain a quote, newline or comma char, need to protect those
  str = str.toString() ? str.toString() : '';
  let useEnclosingQuotes = str.indexOf(',') > -1;
  if (str.includes('"')) {
    str = str.replace(/"/g, '""');
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

async function prependCDNToViewLink(viewLink, contentLocation, reqBody) {
  const service = new ForceService(reqBody.hostUrl, reqBody.sessionId);

  let prefix = '';
  if (viewLink && contentLocation) {
    const stringifiedLabelCDNBaseUrlMap = await service.getLabelCDNBaseUrlMap();
    const cdnBaseUrlLabelMap = new Map(Object.entries(JSON.parse(stringifiedLabelCDNBaseUrlMap)));
    prefix = cdnBaseUrlLabelMap.get(contentLocation);
  }
  return prefix + viewLink;
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
  return await getDigitalAssetViewLink(
    digitalAsset,
    attrValValue,
    helper,
    reqBody
  );
}

// stores digital asset in Map<productId or vvId, Map<Attribute Label Id, DADownloadDetails object>>
// and returns view link of digital asset
async function parseDaAttrValWithVarMap(
  recordId,
  digitalAssetMap,
  attrLabel,
  attrValValue,
  productVariantsDaDetailsMap,
  helper,
  reqBody
) {
  const digitalAsset = digitalAssetMap?.get(attrValValue);
  if (!digitalAsset) return attrValValue;

  if (productVariantsDaDetailsMap.get(recordId) == null) {
    // with the product id/variant value id as key, instantiate Map<attrLabel Id, DA download details obj>
    productVariantsDaDetailsMap.set(
      recordId,
      new Map([
        [attrLabel, new DADownloadDetails(digitalAsset, reqBody.namespace)]
      ])
    );
  } else {
    // with the product id/variant value id as key, add a new key value pair to the value - Map<attrLabel Id, DA download details obj>
    productVariantsDaDetailsMap
      .get(recordId)
      .set(attrLabel, new DADownloadDetails(digitalAsset, reqBody.namespace));
  }
  return await getDigitalAssetViewLink(
    digitalAsset,
    attrValValue,
    helper,
    reqBody
  );
}

async function getDigitalAssetViewLink(
  digitalAsset,
  attrValValue,
  helper,
  reqBody
) {
  const viewLink = helper.getValue(digitalAsset, 'View_Link__c');
  const contentLocation = helper.getValue(digitalAsset, 'Content_Location__c');
  // if value is already complete url, add it to the map, else prepend the CDN url to the partial url then add to map
  attrValValue = viewLink.includes('https')
    ? viewLink
    : await module.exports.prependCDNToViewLink(viewLink, contentLocation, reqBody);
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

async function getLowestVariantsFromProducts(productList, reqBody) {
  const service = new ForceService(reqBody.hostUrl, reqBody.sessionId);
  const helper = new PimExportHelper(reqBody.namespace);

  const allVariantsFromProducts = await service.queryExtend(
    helper.namespaceQuery(
      `select Id, Name, Parent_Value_Path__c, Variant__r.Product__c
        from Variant_Value__c
        where Variant__r.Product__c IN (${service.QUERY_LIST})
      `
    ),
    prepareIdsForSOQL(productList).split(',')
  );

  const lowestVariantValueIds = await getLowestVariantValuesList(allVariantsFromProducts, reqBody.namespace);
  const skuVariants = allVariantsFromProducts.filter(value =>
    lowestVariantValueIds.includes(value.Name)
  );
  console.log('skuVar: ' + skuVariants)
}

// returns a list of the lowest level variant values' ids (i.e. SKUs) from a list of variant values
async function getLowestVariantValuesList(valuesList, namespace) {
  const helper = new PimExportHelper(namespace);
  let numOfParentValues,
    highestNumOfParentValues = 0,
    parentValues,
    vvId,
    parentProduct,
    productParentValueLengthMap = new Map(), // Map<product id, integer>, key: variant value's parent product id, value: current highest no. of parent variant values
    productSKUListMap = new Map(); // Map<product id, list<vv id>, key: variant value's parent product id, value: list of variant value ids with highest no. of parent variant values

  // get the variant value's product
  for (let val of valuesList) {
    parentProduct = helper.getValue(val, 'Variant__r.Product__c');
    parentValues = helper.getValue(val, 'Parent_Value_Path__c');
    if (parentValues == null) {
      numOfParentValues = 0;
    } else {
      numOfParentValues = parentValues.split(',').length;
    }
    vvId = val.Name;

    if (productParentValueLengthMap.has(parentProduct)) {
      // parent product has entry in highest num of parent values tally
      highestNumOfParentValues = productParentValueLengthMap.get(parentProduct);
      if (numOfParentValues === highestNumOfParentValues) {
        if (productSKUListMap.has(parentProduct)) {
          // add vvId to the list of lowest variants aka SKUs
          productSKUListMap.get(parentProduct).push(vvId);
        } else {
          // create new list of lowest variants consisting of vvId for product
          productSKUListMap.set(parentProduct, [vvId]);
        }
      } else if (numOfParentValues > highestNumOfParentValues) {
        // replace list of lowest variants with list consisting of only vvId
        productParentValueLengthMap.set(parentProduct, numOfParentValues);
        productSKUListMap.set(parentProduct, [vvId]);
      }
    } else {
      // create new entry for parent product in highest num of parent values tally
      productParentValueLengthMap.set(parentProduct, numOfParentValues);
      productSKUListMap.set(parentProduct, [vvId]);
    }
  }
  // return each product's list of SKUs
  return Array.from(productSKUListMap.values()).flat();
}

/**
 * converts attribute value's value__c's SObject ID to name of Product/Variant Value for Product Reference fields
 * @param attrValValue - a comma separated String of referenced products' Product__c.Id/Variant_Value__c.Id value
 * @param reqBody - the export request body
 * @returns {String} - a comma separated String of referenced products' Product__c.Name/Variant_Value__c.Name value
 *  */
async function parseProductReferenceAttrVal(attrValValue, reqBody) {
  if (!attrValValue) return '';
  const service = new ForceService(reqBody.hostUrl, reqBody.sessionId);
  const helper = new PimExportHelper(reqBody.namespace);

  // split the value to get the individual Product__c/Variant_Value__c SObject Ids
  let sobjectIds = attrValValue.split(', ');

  sobjectIds = await module.exports.prepareIdsForSOQL(sobjectIds);
  let products = await service.simpleQuery(
    helper.namespaceQuery(
      `select Id, Name
      from Product__c 
      where Id IN (${sobjectIds})`
    )
  );
  let variantValues = await service.simpleQuery(
    helper.namespaceQuery(
      `select Id, Name
      from Variant_Value__c 
      where Id IN (${sobjectIds})`
    )
  );
  return products
    .concat(variantValues)
    .map(record => {
      return record.Name;
    })
    .join(', ');
}
