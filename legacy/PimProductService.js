let helper;
let service;

async function PimProductService(productsList, pHelper, pService) {
  helper = pHelper;
  service = pService;
  return await getResultForProductStructure(productsList);
}

// PIM repo ProductService.getResultForProductStructure(productsList)
async function getResultForProductStructure(productsList) {
  let productVariantValueMapList = [];
  let productMap = await getProductMap(productsList);
  let variantStructure = await getVariantStructure(productsList);
  let tempMap;
  let variantsList = [];
  Array.from(productMap.values()).forEach(product => {
    tempMap = new Map();
    tempMap.set('Id', product.Id);
    tempMap.set('Product_ID', product.Name);
    tempMap.set(
      'Category__r.Name',
      helper.getValue(product, 'Category__r').Name
    );
    tempMap.set('Category__c', helper.getValue(product, 'Category__c'));
    productVariantValueMapList.push(tempMap);

    variantsList = variantStructure.get(product.Id);
    if (variantsList != null) {
      variantsList.forEach(variant => {
        if (helper.getValue(variant, 'Variant_Values__r') != null) {
          let value;
          for (
            let i = 0;
            i < helper.getValue(variant, 'Variant_Values__r').records.length;
            i++
          ) {
            value = helper.getValue(variant, 'Variant_Values__r').records[i];
            tempMap = new Map();
            tempMap.set('Id', value.Id);
            tempMap.set('Product_ID', value.Name);
            tempMap.set(
              'Title',
              helper.getValue(value, 'Label__c')
                ? helper.getValue(value, 'Label__c')
                : value.Name
            );
            tempMap.set('Parent_ID', product.Id);
            tempMap.set(
              'Category__r.Name',
              helper.getValue(product, 'Category__r').Name
            );
            tempMap.set('Category__c', helper.getValue(product, 'Category__c'));
            productVariantValueMapList = [
              ...productVariantValueMapList,
              tempMap
            ];
          }
        }
      });
    }
  });
  return productVariantValueMapList;
}

// PIM repo ProductManager.getProductMap
async function getProductMap(productsList) {
  let productMap = new Map();
  productsList.forEach(product => {
    productMap.set(product.Id, product);
  });
  return productMap;
}

// PIM repo ProductManager.getVariantStructure
async function getVariantStructure(productsList) {
  let productsIds = [];
  let variantsList = [];
  productsList.forEach(product => {
    productsIds.push(product.Id);
  });
  productsIds = productsIds.map(id => `'${id}'`).join(',');
  if (productsIds.length > 0) {
    variantsList = await service.simpleQuery(
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
  }

  let variantStructure = new Map();
  variantsList.forEach(variant => {
    if (!variantStructure.has(helper.getValue(variant, 'Product__c'))) {
      variantStructure.set(helper.getValue(variant, 'Product__c'), []);
    }
    variantStructure.set(helper.getValue(variant, 'Product__c'), [
      ...variantStructure.get(helper.getValue(variant, 'Product__c')),
      variant
    ]);
  });
  return variantStructure;
}

module.exports = PimProductService;
