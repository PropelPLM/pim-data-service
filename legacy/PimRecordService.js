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
  if (!recordList || recordList.length == 0) return [];
  helper = pHelper;
  service = pService;
  return await getResultForProductStructure(recordList, isProduct);
}

// PIM repo ProductService.getResultForProductStructure(recordList)
// returns List of Maps
async function getResultForProductStructure(recordList, isProduct) {
  let productVariantValueMapList = isProduct ? [] : [populateRecordDetailsMap(helper, recordList[0])];

  // return digital asset record details
  if (!isProduct) return productVariantValueMapList;
  
  let variantStructure = await getVariantStructure(recordList),
    productVariants,
    variantValues;

  recordList.forEach(product => {
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

// PIM repo ProductManager.getVariantStructure
// returns Map<Product: List[Variants]>
async function getVariantStructure(productsList) {
  const productsIds = prepareIdsForSOQL(productsList);
  const variantStructure = new Map();

  if (productsIds.length == 0) return variantStructure;
  const variantsList = await service.queryExtend(
    helper.namespaceQuery(
      `select Id, Name, Product__c,
      (
        select
          Id,
          Name,
          Label__c,
          Parent_Value_Path__c,
          Completeness_Score__c
        from Variant_Values__r
        order by Name
      )
      from Variant__c
      where Product__c IN (${service.QUERY_LIST})`.replace(/\n/g, ' ')
    ), productsIds.split(',')
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
  const categoryName = helper.getValue(topLevelRecord, 'Category__r') ? 
    helper.getValue(topLevelRecord, 'Category__r').Name :
    '';
  const tempMap = new Map();
  tempMap.set('Id', record.Id);
  tempMap.set('Record_ID', record.Name);
  tempMap.set('Category__r.Name', categoryName);
  tempMap.set('Category__c', helper.getValue(topLevelRecord, 'Category__c'));
  tempMap.set('CreatedDate', record.CreatedDate);
  tempMap.set('External_File_Id__c', helper.getValue(topLevelRecord, 'External_File_Id__c'));
  tempMap.set('Mime_Type__c', helper.getValue(topLevelRecord, 'Mime_Type__c'));
  tempMap.set('Size__c', helper.getValue(topLevelRecord, 'Size__c'));
  tempMap.set('View_Link__c', helper.getValue(topLevelRecord, 'View_Link__c'));

  let completenessScore = helper.getValue(record, 'Completeness_Score__c');
  // We cant do !completenessScore here because if completenessScore == 0, it will evaluate to true.
  // Hence we need to specifically check for null and undefined.
  if (completenessScore === null || completenessScore === undefined || completenessScore < 0) {
      completenessScore = '--';
  }
  tempMap.set('Completeness_Score__c', completenessScore);

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
