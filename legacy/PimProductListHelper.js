const PimProductManager = require('./PimProductManager');
const PimProductService = require('./PimProductService');
const {
  ATTRIBUTE_FLAG,
  DA_DOWNLOAD_DETAIL_KEY,
  prepareIdsForSOQL,
  parseDigitalAssetAttrVal
} = require('./utils');

let helper;
let service;
const DA_TYPE = 'DigitalAsset';

async function PimProductListHelper(
  reqBody,
  pHelper,
  pService,
  templateFields,
  templateHeaders
) {
  helper = pHelper;
  service = pService;

  let daDownloadDetailsList;
  const recordIds = reqBody.recordIds;
  const vvIds = reqBody.variantValueIds;
  const categoryId = reqBody.categoryId;
  const isPrimaryCategory = reqBody.isPrimaryCategory;

  /** PIM repo ProductService.productStructureByCategory start */
  let pqlBuilder = {
    objectType: 'CATEGORY',
    objectId: categoryId
  };

  // PIM repo ProductPQLHelper.getRecordByCategory()
  const exportRecords = await getRecordByCategory(
    reqBody,
    pqlBuilder,
    isPrimaryCategory
  );

  // filter the records if rows were selected or filters applied in product list page
  let filteredRecords = [];
  exportRecords.forEach(record => {
    if (
      recordIds.includes(record.get('Id')) ||
      vvIds.includes(record.get('Id'))
    ) {
      filteredRecords.push(record);
    }
  });
  let exportRecordsAndColumns = [filteredRecords];

  /** PIM repo ProductService.productStructureByCategory end */

  /** PIM repo ProductService.getProductDetail start */
  // gets Products' attribute(s) if any
  if (recordIds.length > 0 || vvIds.length > 0) {
    let productIdSet = new Set();
    let variantValueIds = new Set();
    for (let i = 0; i < recordIds.length; i++) {
      productIdSet.add(recordIds[i]);
    }
    for (let i = 0; i < vvIds.length; i++) {
      variantValueIds.add(vvIds[i]);
    }

    let attributeResults = new Map();
    if (variantValueIds.size > 0) {
      const stringifiedQuotedVariantValueIds =
        prepareIdsForSOQL(variantValueIds);
      let variantValues = await service.queryExtend(
        helper.namespaceQuery(
          `select Id, Variant__r.Product__c
          from Variant_Value__c
          where Id IN (${service.QUERY_LIST})
        `
        ),
        stringifiedQuotedVariantValueIds.split(',')
      );
      variantValues.forEach(value => {
        productIdSet.add(helper.getValue(value, 'Variant__r.Product__c'));
      });
    }

    const productIds = prepareIdsForSOQL(productIdSet);
    let productsList = await PimProductManager(productIds, helper, service);
    let productMap = await getProductMap(productsList);
    attributeResults = await getResultForProductMap(
      productMap,
      variantValueIds,
      productsList,
      reqBody
    );

    if (attributeResults.has(DA_DOWNLOAD_DETAIL_KEY)) {
      daDownloadDetailsList = attributeResults.get(DA_DOWNLOAD_DETAIL_KEY);
      attributeResults.delete(DA_DOWNLOAD_DETAIL_KEY);
    }

    // sort the export records to the same format as product list page
    exportRecordsAndColumns[0].sort((a, b) =>
      a.get('Product_ID') > b.get('Product_ID') ? 1 : -1
    );

    /** PIM repo ProductService.getProductDetail end */
    // for each key of attribute results (Product__c Id or Variant_Value__c Id)
    if (attributeResults.size > 0) {
      const productIdKeys = Array.from(attributeResults.keys());
      productIdKeys.forEach(productId => {
        if (attributeResults.get(productId) !== null) {
          // check list of export records if there is a Map with a matching Id
          exportRecordsAndColumns[0].forEach(exportRecord => {
            if (exportRecord.get('Id') === productId) {
              // add attribute labels and values from attributeResults into corresponding export record
              const labels = Array.from(attributeResults.get(productId).keys());
              const values = Array.from(
                attributeResults.get(productId).values()
              );
              for (let i = 0; i < labels.length; i++) {
                exportRecord.set(labels[i], values[i]);
              }
            }
          });
        }
      });
    }
  }

  return {
    daDownloadDetailsList,
    recordsAndCols: await addExportColumns(
      reqBody,
      templateFields,
      templateHeaders,
      exportRecordsAndColumns
    )
  };
}

// PIM repo ProductPQLHelper.getRecordByCategory()
async function getRecordByCategory(reqBody, pqlBuilder, isPrimaryCategory) {
  if (pqlBuilder.objectId === null) {
    throw 'Category Id is blank or null';
  }

  // get base structure
  let cm = {
    allChildrenIds: new Set(),
    allParentIds: new Set(),
    startingCategoryId: pqlBuilder.objectId
  };
  isPrimaryCategory = await getCategoryPrimaryStatus(pqlBuilder.objectId);
  let childrenIds = await getAllChildrenIds(cm);
  let pm;
  if (isPrimaryCategory) {
    pm = await buildStructureWithCategoryIds(childrenIds);
  } else {
    pm = await buildStructureWithSecondaryCategoryIds(childrenIds);
  }
  let tempRecords = await PimProductService(pm, helper, service);
  return tempRecords;
}

async function getCategoryPrimaryStatus(categoryId) {
  const categoryIdList = prepareIdsForSOQL([categoryId]);
  const categoryList = await service.simpleQuery(
    helper.namespaceQuery(
      `select Id, Is_Primary__c
      from Category__c
      where Id IN (${categoryIdList})`
    )
  );
  return helper.getValue(categoryList[0], 'Is_Primary__c');
}

// PIM repo CategoryManager.getAllChildrenIds()
async function getAllChildrenIds(cm) {
  let nextIds = new Set();
  let tempCategories = [];

  cm.allChildrenIds.add(cm.startingCategoryId);
  nextIds.add(cm.startingCategoryId);

  while (nextIds.size > 0) {
    tempCategories = await categoryChildrenQuery(nextIds);
    nextIds = new Set();

    tempCategories.forEach(cat => {
      nextIds.add(cat.Id);
    });
    nextIds.forEach(id => {
      cm.allChildrenIds.add(id);
    });
  }
  return cm.allChildrenIds;
}

// PIM repo CategoryManager.categoryChildrenQuery()
async function categoryChildrenQuery(pParentIds) {
  try {
    let listParentIds = [];
    pParentIds.forEach(id => {
      listParentIds.push(id);
    });
    listParentIds = prepareIdsForSOQL(listParentIds);
    return await service.simpleQuery(
      helper.namespaceQuery(
        `select Id, Name, Parent__c
        from Category__c
        where Parent__c IN (${listParentIds})
      `
      )
    );
  } catch (err) {
    console.error(err);
  }
}

// PIM repo ProductManager.buildStructureWithCategoryIds()
async function buildStructureWithCategoryIds(pCategoryIds) {
  if (pCategoryIds.size === 0) {
    throw 'No Category Ids';
  }
  let listCategoryIds = [];
  pCategoryIds.forEach(id => {
    listCategoryIds.push(id);
  });
  listCategoryIds = prepareIdsForSOQL(listCategoryIds);
  // return productsList
  return await service.simpleQuery(
    helper.namespaceQuery(
      `select Id, Name, Category__c, Category__r.Name,
      (
        select
            Id,
            Name,
            Attribute_Label__c,
            Attribute_Label__r.Attribute_Group__r.Name,
            Attribute_Label__r.Attribute_Group__r.Attribute_Tab__r.Name,
            Attribute_Label__r.Label__c,
            Attribute_Label__r.Mandatory__c,
            Attribute_Label__r.Primary_Key__c,
            Attribute_Label__r.Type__c,
            Overwritten_Variant_Value__c,
            Overwritten_Variant_Value__r.Label__c,
            Overwritten_Variant_Value__r.Name,
            Overwritten_Variant_Value__r.Parent_Value_Path__c,
            Value__c
        from Attributes__r
        order by Attribute_Label__r.Order__c asc
      ),
      (
        select
            Id,
            Name,
            Attribute_Group__r.Attribute_Tab__c
        from Attribute_Group_Links__r
      ),
      (
        select
            Id,
            Name,
            Order__c
        from Variants__r
      )
      from Product__c
      where Category__c IN (${listCategoryIds})`
    )
  );
}

// PIM repo ProductManager.buildStructureWithSecondaryCategoryIds()
async function buildStructureWithSecondaryCategoryIds(pCategoryIds) {
  if (pCategoryIds.size === 0) {
    throw 'No Category Ids';
  }
  let listCategoryIds = [];
  pCategoryIds.forEach(id => {
    listCategoryIds.push(id);
  });
  listCategoryIds = prepareIdsForSOQL(listCategoryIds);
  let links = await service.simpleQuery(
    helper.namespaceQuery(
      `select Id, Product__c
      from Product_Category_Link__c
      where Primary_Category__c IN (${listCategoryIds})`
    )
  );

  if (links.size > 0) {
    let productIds = [];
    links.forEach(link => {
      productIds.push(helper.getValue(link, 'Product__c'));
    });
    productIds = prepareIdsForSOQL(productIds);
    // return productsList
    return await service.simpleQuery(
      helper.namespaceQuery(
        `select Id, Name, Category__c, Category__r.Name,
      (
        select
            Id,
            Name,
            Attribute_Label__c,
            Attribute_Label__r.Attribute_Group__r.Name,
            Attribute_Label__r.Attribute_Group__r.Attribute_Tab__r.Name,
            Attribute_Label__r.Label__c,
            Attribute_Label__r.Mandatory__c,
            Attribute_Label__r.Primary_Key__c,
            Attribute_Label__r.Type__c,
            Overwritten_Variant_Value__c,
            Overwritten_Variant_Value__r.Label__c,
            Overwritten_Variant_Value__r.Name,
            Overwritten_Variant_Value__r.Parent_Value_Path__c,
            Value__c
        from Attributes__r
        order by Attribute_Label__r.Order__c asc
      ),
      (
        select
            Id,
            Name,
            Attribute_Group__r.Attribute_Tab__c
        from Attribute_Group_Links__r
      ),
      (
        select
            Id,
            Name,
            Order__c
        from Variants__r
      )
      from Product__c
      where Id IN (${productIds})`
      )
    );
  }
}

// PIM repo ProductManager.getProductMap
async function getProductMap(productsList) {
  let productMap = new Map();
  productsList.forEach(product => {
    productMap.set(product.Id, product);
  });
  return productMap;
}

// PIM repo ProductService.getResultForProductMap
async function getResultForProductMap(
  productMap,
  variantValueIds,
  productsList,
  reqBody
) {
  let results = new Map();
  let tempMap = new Map();
  const daDownloadDetailsList = [];
  let variantToAttributeMap = await getVariantMap(productsList);
  const digitalAssetList = await service.simpleQuery(
    helper.namespaceQuery(
      `select Id, Name, External_File_Id__c, View_Link__c
      from Digital_Asset__c`
    )
  );
  const digitalAssetMap = new Map(
    digitalAssetList.map(asset => {
      return [asset.Id, asset];
    })
  );

  for (let product of Array.from(productMap.values())) {
    tempMap = new Map();
    if (helper.getValue(product, 'Attributes__r') === null) continue;

    for (let attribute of helper.getValue(product, 'Attributes__r').records) {
      console.log({ attribute });

      if (
        helper.getValue(attribute, 'Overwritten_Variant_Value__c') !== null ||
        helper.getValue(attribute, 'Attribute_Label__r') === null
      )
        continue;

      let attrValValue = helper.getValue(attribute, 'Value__c');
      // replace digital asset id with CDN url if Attribute_Label__c is of Type__c 'DigitalAsset'
      if (
        helper.getValue(attribute, 'Attribute_Label__r.Type__c') === DA_TYPE
      ) {
        attrValValue = await parseDigitalAssetAttrVal(
          digitalAssetMap,
          attrValValue,
          daDownloadDetailsList,
          helper,
          reqBody
        );
      }
      tempMap.set(
        helper.getValue(attribute, 'Attribute_Label__r.Primary_Key__c'),
        attrValValue
      );
    }
    results.set(product.Id, tempMap);
  }

  let variantValueDetailMap = await getVariantValueDetailMap(productsList);
  let tempVariantValue;
  let tempVariantMap = new Map();
  for (let vvId of variantValueIds) {
    tempVariantValue = variantValueDetailMap.get(vvId);
    tempVariantMap = new Map(
      results.get(helper.getValue(tempVariantValue, 'Variant__r.Product__c'))
    );
    if (helper.getValue(tempVariantValue, 'Parent_Value_Path__c')) {
      // Variant has a parent variant, traverse the parent path
      for (let pathVVId of helper
        .getValue(tempVariantValue, 'Parent_Value_Path__c')
        .split(',')) {
        // for each parent, add their overwritten attribute values
        if (!variantToAttributeMap.has(pathVVId)) continue;

        for (let attribute of variantToAttributeMap.get(pathVVId)) {
          let attrValValue = helper.getValue(attribute, 'Value__c');
          // replace digital asset id with CDN url if Attribute_Label__c is of Type__c 'DigitalAsset'
          if (
            helper.getValue(attribute, 'Attribute_Label__r.Type__c') === DA_TYPE
          ) {
            attrValValue = await parseDigitalAssetAttrVal(
              digitalAssetMap,
              attrValValue,
              daDownloadDetailsList,
              helper,
              reqBody
            );
          }
          tempVariantMap.set(
            helper.getValue(attribute, 'Attribute_Label__r.Primary_Key__c'),
            attrValValue
          );
        }
      }
    }

    if (variantToAttributeMap.has(vvId)) {
      for (let attribute of variantToAttributeMap.get(vvId)) {
        if (!helper.getValue(attribute, 'Attribute_Label__r')) continue;

        let attrValValue = helper.getValue(attribute, 'Value__c');
        // replace digital asset id with CDN url if Attribute_Label__c is of Type__c 'DigitalAsset'
        if (
          helper.getValue(attribute, 'Attribute_Label__r.Type__c') === DA_TYPE
        ) {
          attrValValue = await parseDigitalAssetAttrVal(
            digitalAssetMap,
            attrValValue,
            daDownloadDetailsList,
            helper,
            reqBody
          );
        }
        tempVariantMap.set(
          helper.getValue(attribute, 'Attribute_Label__r.Primary_Key__c'),
          attrValValue
        );
      }
    }
    results.set(vvId, tempVariantMap);
  }

  if (daDownloadDetailsList.length > 0) {
    results.set(DA_DOWNLOAD_DETAIL_KEY, daDownloadDetailsList);
  }

  return results;
}

// PIM repo ProductManager.getVariantMap()
async function getVariantMap(productsList) {
  let variantMap = new Map();
  productsList.forEach(product => {
    if (helper.getValue(product, 'Attributes__r') !== null) {
      helper.getValue(product, 'Attributes__r').records.forEach(attribute => {
        // iterate through each product's Attribute_Value__c
        if (
          helper.getValue(attribute, 'Overwritten_Variant_Value__c') !== null
        ) {
          // if the Attribute_Value__c (e.g. 4kg) belongs to a variant (e.g. AC-SWSH-1001-BLK-M)
          if (
            variantMap.has(
              helper.getValue(attribute, 'Overwritten_Variant_Value__c')
            )
          ) {
            // add on the Attribute_Value__c to the list of attribute values belonging to the variant
            variantMap.set(
              helper.getValue(attribute, 'Overwritten_Variant_Value__c'),
              [
                ...variantMap.get(
                  helper.getValue(attribute, 'Overwritten_Variant_Value__c')
                ),
                attribute
              ]
            );
          } else {
            // instantiate the list of attribute values
            variantMap.set(
              helper.getValue(attribute, 'Overwritten_Variant_Value__c'),
              [attribute]
            );
          }
        }
      });
    }
  });
  return variantMap;
}

// PIM repo ProductManager.getVariantValueDetailMap()
async function getVariantValueDetailMap(productsList) {
  let productIdList = [];
  productsList.forEach(product => {
    productIdList.push(product.Id);
  });
  productIdList = prepareIdsForSOQL(productIdList);
  let variantValueMap = new Map();
  const variantValueList = await service.simpleQuery(
    helper.namespaceQuery(
      `select Id, Parent_Value_Path__c, Variant__r.Product__c
      from Variant_Value__c
      where Variant__r.Product__c IN (${productIdList})`
    )
  );
  variantValueList.forEach(value => {
    variantValueMap.set(value.Id, value);
  });
  return variantValueMap;
}

async function addExportColumns(
  reqBody,
  templateFields,
  templateHeaders,
  exportRecordsAndColumns
) {
  // Map of col's <label, fieldName>
  const defaultColumns = new Map([
    ['Product ID', 'Product_ID'],
    ['Title', 'Title'],
    ['Category Name', 'Category__r.Name']
  ]);
  let exportColumns = [];
  let templateHeaderValueMap = new Map();

  // populate default columns first if not templated export
  if (!templateFields || templateFields.length === 0) {
    Array.from(defaultColumns.keys()).forEach(defaultCol => {
      exportColumns.push({
        fieldName: defaultColumns.get(defaultCol),
        label: defaultCol,
        type: 'text'
      });
    });
  }

  // add columns for selected attributes and children of selected attribute groups
  const linkedAttributes = reqBody.linkedLabels;
  let linkedGroups = reqBody.linkedGroups;
  let linkedGroupsChildren = [];
  let columnAttributeIds = new Set();
  if (linkedAttributes.length > 0) {
    linkedAttributes.forEach(attr => {
      columnAttributeIds.add(attr);
    });
  }
  if (linkedGroups.length > 0) {
    linkedGroups = prepareIdsForSOQL(linkedGroups);
    linkedGroupsChildren = await service.simpleQuery(
      helper.namespaceQuery(
        `select Id, Name, Attribute_Group__c
        from Attribute_Label__c
        where Attribute_Group__c IN (${linkedGroups})`
      )
    );
    linkedGroupsChildren.forEach(childAttr => {
      columnAttributeIds.add(childAttr.Id);
    });
  }
  if (columnAttributeIds.size > 0) {
    columnAttributeIds = Array.from(columnAttributeIds);
    columnAttributeIds = prepareIdsForSOQL(columnAttributeIds);

    // get SOQL query for Label__c of all attribute labels
    const columnAttributes = await service.simpleQuery(
      helper.namespaceQuery(
        `select Id, Label__c, Primary_Key__c
        from Attribute_Label__c
        where Classification__c = 'Product' AND Id IN (${columnAttributeIds})`
      )
    );

    // add these attributes as columns to export
    columnAttributes.forEach(attr => {
      exportColumns.push({
        fieldName: helper.getValue(attr, 'Primary_Key__c'),
        label: helper.getValue(attr, 'Label__c'),
        type: 'text'
      });
    });
  } else {
    // TODO:
    const columnAttributes = await service.simpleQuery(
      helper.namespaceQuery(
        `select Id, Label__c, Primary_Key__c
      from Attribute_Label__c
      where Classification__c = 'Product' order by Primary_Key__c`
      )
    );

    if (!templateFields || templateFields.length === 0) {
      columnAttributes.forEach(attr => {
        // if not template export, push all attribute columns
        exportColumns.push({
          fieldName: helper.getValue(attr, 'Primary_Key__c'),
          label: helper.getValue(attr, 'Label__c'),
          type: 'text'
        });
      });
    } else if (templateFields && templateFields.length > 0) {
      // add columns specified in template
      let field;
      let isAttributeField;
      let isDefaultColumn;
      const defaultColumnNames = Array.from(defaultColumns.keys());
      for (let i = 0; i < templateFields.length; i++) {
        field = templateFields[i];
        isAttributeField = field.includes(ATTRIBUTE_FLAG);
        isDefaultColumn = defaultColumnNames.includes(field.slice(11, -1));
        if (isAttributeField && isDefaultColumn) {
          // value specified in template is a field's value, and col in template is a default column
          field = field.slice(11, -1);
          exportColumns.push({
            fieldName: defaultColumns.get(field),
            label: templateHeaders[i],
            type: 'text'
          });
        } else if (isAttributeField && !isDefaultColumn) {
          // value specified in template is a field's value, and col in template is an attribute column
          field = field.slice(11, -1);
          columnAttributes.forEach(colAttr => {
            if (helper.getValue(colAttr, 'Label__c') === field) {
              exportColumns.push({
                fieldName: helper.getValue(colAttr, 'Primary_Key__c'),
                label: templateHeaders[i],
                type: 'text'
              });
            }
          });
        } else if (!isAttributeField) {
          // col's value specified in template is a raw value
          templateHeaderValueMap.set(templateHeaders[i], field);
          exportColumns.push({
            fieldName: templateHeaders[i],
            label: templateHeaders[i],
            type: 'text'
          });
        }
      }
    }
  }
  // populate export records with raw values specified in the template
  Array.from(templateHeaderValueMap.keys()).forEach(header => {
    exportRecordsAndColumns[0].forEach(recordMap => {
      recordMap.set(header, templateHeaderValueMap.get(header));
    });
  });
  return [...exportRecordsAndColumns, exportColumns];
}

module.exports = PimProductListHelper;
