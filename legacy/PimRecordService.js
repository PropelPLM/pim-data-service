const {
  logErrorResponse,
  logSuccessResponse,
  prepareIdsForSOQL
} = require('./utils');

let helper;
let service;

async function PimRecordService(
  recordList,
  pHelper,
  pService,
  isProduct = true
) {
  helper = pHelper;
  service = pService;
  return await getResultForProductStructure(recordList, isProduct);
}

// PIM repo ProductService.getResultForProductStructure(recordList)
// returns List of products and variants pointing to Maps
async function getResultForProductStructure(recordList, isProduct) {
  let productVariantValueMapList = [],
    recordMap = getRecordMap(recordList);

  if (!isProduct) return recordMap;
  let variantStructure = await getVariantStructure(recordList),
    productVariants,
    variantValues;

  Array.from(recordMap.values()).forEach(product => {
    productVariantValueMapList.push(populateRecordDetailsMap(helper, product));
    productVariants = variantStructure.get(product.Id);
    if (productVariants == null) return;

    productVariants.forEach(variant => {
      variantValues = helper.getValue(variant, 'Variant_Values__r');
      if (variantValues == null) return;

      variantValues?.records.forEach(variantValue => {
        productVariantValueMapList.push(
          populateRecordDetailsMap(helper, variantValue, product)
        );
      });
    });
  });
  return productVariantValueMapList;
}

// PIM repo ProductManager.getProductMap
function getRecordMap(recordList) {
  try {
    let recordMap = new Map();
    recordList.forEach(record => {
      recordMap.set(record.Id, record);
    });
    logSuccessResponse(
      `Records in recordMap: ${recordMap?.size}`,
      '[PimRecordService.getRecordMap]'
    );
    return recordMap;
  } catch (err) {
    logErrorResponse(err, '[PimRecordService.getRecordMap]');
  }
}

// PIM repo ProductManager.getVariantStructure
// returns Map<Product: List[Variants]>
async function getVariantStructure(productsList) {
  const productsIds = prepareIdsForSOQL(productsList);
  const variantStructure = new Map();

  if (productsIds.length == 0) return variantStructure;
  const variantsList = await service.simpleQuery(
    helper.namespaceQuery(
      `select Id, Name, Product__c,
      (
        select
          Id,
          Name,
          Label__c,
          Parent_Value_Path__c
        from Variant_Values__r
        order by Name
      )
      from Variant__c
      where Product__c IN (${productsIds})
      order by Order__c`
    )
  );

  let variantParentProductId;
  variantsList.forEach(variant => {
    variantParentProductId = helper.getValue(variant, 'Product__c');
    if (!variantStructure.has(variantParentProductId)) {
      variantStructure.set(variantParentProductId, []);
    }
    variantStructure.get(variantParentProductId).push(variant);
  });
  return variantStructure;
}

function populateRecordDetailsMap(helper, record, parentProduct) {
  const topLevelRecord = parentProduct ?? record;
  const tempMap = new Map();
  tempMap.set('Id', record.Id);
  tempMap.set('Record_ID', record.Name);
  tempMap.set(
    'Category__r.Name',
    helper.getValue(topLevelRecord, 'Category__r').Name
  );
  tempMap.set('Category__c', helper.getValue(topLevelRecord, 'Category__c'));

  if (!parentProduct) return tempMap;

  tempMap.set(
    'Title',
    helper.getValue(record, 'Label__c')
      ? helper.getValue(record, 'Label__c')
      : record.Name
  );
  tempMap.set('Parent_ID', topLevelRecord.Id);
  return tempMap;
}

module.exports = PimRecordService;
