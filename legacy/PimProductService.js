let helper;
let service;

async function PimProductService(productsList, pHelper, pService) {
  helper = pHelper;
  service = pService;
  return await getResultForProductStructure(productsList);
}

// PIM repo ProductService.getResultForProductStructure(productsList)
async function getResultForProductStructure(productsList) {
  let productVariantValueMapList = [],
    productMap = getProductMap(productsList),
    variantStructure = await getVariantStructure(productsList),
    productVariants,
    variantValues;

  Array.from(productMap.values()).forEach(product => {
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
function getProductMap(productsList) {
  let productMap = new Map();
  productsList.forEach(product => {
    productMap.set(product.Id, product);
  });
  return productMap;
}

// PIM repo ProductManager.getVariantStructure
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

  variantsList.forEach(variant => {
    if (!variantStructure.has(helper.getValue(variant, 'Product__c'))) {
      variantStructure.set(helper.getValue(variant, 'Product__c'), []);
    }

    variantStructure.set(
      helper.getValue(variant, 'Product__c'),
      variantStructure.get(helper.getValue(variant, 'Product__c')).push(variant)
    );
  });
  return variantStructure;
}

function populateRecordDetailsMap(helper, record, parentProduct) {
  const topLevelRecord = parentProduct ?? record;
  const tempMap = new Map();
  tempMap.set('Id', record.Id);
  tempMap.set('Product_ID', record.Name);
  tempMap.set(
    'Category__r.Name',
    helper.getValue(topLevelRecord, 'Category__r').Name
  );
  tempMap.set('Category__c', helper.getValue(topLevelRecord, 'Category__c'));

  if (!parentProduct) return tempMap;

  tempMap.set(
    'Title',
    helper.getValue(variantValue, 'Label__c')
      ? helper.getValue(variantValue, 'Label__c')
      : variantValue.Name
  );
  tempMap.set('Parent_ID', topLevelRecord.Id);
  return tempMap;
}

module.exports = PimProductService;
