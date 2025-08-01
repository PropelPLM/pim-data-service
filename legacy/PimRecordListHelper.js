const PimRecordManager = require('./PimRecordManager');
const PimRecordService = require('./PimRecordService');
const {
  ATTRIBUTE_FLAG,
  DA_DOWNLOAD_DETAIL_KEY,
  DEFAULT_COLUMNS,
  DEFAULT_ASSET_COLUMNS,
  getLowestVariantsFromProducts,
  extractLowestVariantValues,
  initAssetDownloadDetailsList,
  prepareIdsForSOQL,
  parseDigitalAssetAttrVal,
  parseProductReferenceAttrVal
} = require('./utils');

let helper;
let service;
const DA_TYPE = 'DigitalAsset';
const PRODUCT_REFERENCE_TYPE = 'ProductReference';
const SYSTEM_ATTRIBUTES_LABEL = 'System Attributes';

async function PimRecordListHelper(
  reqBody,
  pHelper,
  pService,
  templateFields,
  templateHeaders,
  digitalAssetMap,
  isProduct = true
) {
  helper = pHelper;
  service = pService;

  let daDownloadDetailsList;
  const {
    categoryId,
    includeRecordAsset,
    isPrimaryCategory,
    exportType,
    recordIds,
    variantValueIds,
    namespace,
    exportOption
  } = reqBody;

  /** PIM repo ProductService.productStructureByCategory start */
  let pqlBuilder = {
    objectType: 'CATEGORY',
    objectId: categoryId
  };

  // PIM repo ProductPQLHelper.getRecordByCategory()
  const exportRecords = await getRecordByCategory(
      pqlBuilder,
      isPrimaryCategory,
      isProduct
    ),
    isSKUExport = exportType === 'lowestVariants';

  // filter the records if rows were selected or filters applied in product list page
  let filteredRecords = exportRecords.filter(record => {
    return recordIds?.includes(record.get('Id')) || variantValueIds?.includes(record.get('Id'));
  });
  let exportRecordsAndColumns = [filteredRecords]; // [[filtered]] zz

  /** PIM repo ProductService.productStructureByCategory end */

  /** PIM repo ProductService.getProductDetail start */
  // gets Products' attribute(s) if any
  if (recordIds.length > 0 || variantValueIds.length > 0) {
    let recordIdSet = new Set();
    let vvIds = new Set();
    if (exportType == null || !isSKUExport) {
      // non variant values are only added if its not exporting lowest variants
      for (let i = 0; i < recordIds?.length; i++) {
        recordIdSet.add(recordIds[i]);
      }
    }
    for (let i = 0; i < variantValueIds?.length; i++) {
      vvIds.add(variantValueIds[i]);
    }

    let attributeResults = new Map();
    let selectedRecordParentProductId;
    let productsToQueryForSKU = [];
    if (isSKUExport && exportRecordsAndColumns[0].length) {
      // get parent products of selected records
      for (let selectedRecord of exportRecordsAndColumns[0]) {
        selectedRecordParentProductId = selectedRecord.get('Parent_ID') ?? selectedRecord.get('Id');
        if (!productsToQueryForSKU.includes(selectedRecordParentProductId)) {
          productsToQueryForSKU.push(selectedRecordParentProductId);
        }
      }
      // get SKUs (lowest variants) of parent products of selected records
      let lowestVariants = await getLowestVariantsFromProducts(productsToQueryForSKU, reqBody);
      if (exportOption === 'export-filtered') {
        // For export-filtered, we want to apply What You See Is What You Get (WYSIWYG).
        // The variantValueIds here are passed in from the BE and it may potentially contain lowest variants.
        // Hence, to only show WYSIWYG, we have to filter out these variantValueIds in lowestVariants.
        lowestVariants = lowestVariants.filter(lowestVariant => {
          return variantValueIds.includes(lowestVariant.Id);
        });
      }
      exportRecordsAndColumns[0] = await populateRecordDetailsForLowestVariants(lowestVariants);
      // update variant value ids and record ids with only those relevant to lowest variants
      vvIds.clear();
      for (let lowestVariant of lowestVariants) {
        vvIds.add(lowestVariant.Id)
        recordIdSet.add(helper.getValue(lowestVariant, 'Variant__r.Product__c'));
      }
    } else if (!isSKUExport && exportRecordsAndColumns[0].length) {
      const stringifiedQuotedVariantValueIds = prepareIdsForSOQL(vvIds);
      let variantValues = await service.queryExtend(
        helper.namespaceQuery(
          `select Id, Name, Parent_Value_Path__c, Variant__r.Product__c
          from Variant_Value__c
          where Id IN (${service.QUERY_LIST})
        `
        ),
        stringifiedQuotedVariantValueIds.split(',')
      );
      variantValues.forEach(value => {
        recordIdSet.add(helper.getValue(value, 'Variant__r.Product__c'));
      });
    }

    const recordIdsToQuery = prepareIdsForSOQL(recordIdSet);
    let recordList = await PimRecordManager(
      recordIdsToQuery,
      helper,
      service,
      isProduct
    );
    let recordMap = await getRecordMap(recordList);
    attributeResults = await getAttributesForRecordMap(
      recordMap,
      vvIds,
      recordList,
      reqBody,
      digitalAssetMap,
      initAssetDownloadDetailsList(
        isProduct,
        includeRecordAsset,
        recordList.map(record => record.Id),
        digitalAssetMap,
        namespace
      )
    );

    if (attributeResults.has(DA_DOWNLOAD_DETAIL_KEY)) {
      daDownloadDetailsList = attributeResults.get(DA_DOWNLOAD_DETAIL_KEY);
      attributeResults.delete(DA_DOWNLOAD_DETAIL_KEY);
    }

    // sort the export records to the same format as product list page
    exportRecordsAndColumns[0].sort((a, b) =>
      a.get('Record_ID') > b.get('Record_ID') ? 1 : -1
    );

    /** PIM repo ProductService.getProductDetail end */
    // for each key of attribute results (Product__c Id or Variant_Value__c Id)
    if (attributeResults.size > 0) {
      const recordIdKeys = Array.from(attributeResults.keys());
      recordIdKeys.forEach(recordId => {
        if (attributeResults.get(recordId) !== null) {
          // check list of export records if there is a Map with a matching Id
          exportRecordsAndColumns[0].forEach(exportRecord => {
            if (exportRecord.get('Id') === recordId) {
              // add attribute labels and values from attributeResults into corresponding export record
              const labels = Array.from(attributeResults.get(recordId).keys());
              const values = Array.from(
                attributeResults.get(recordId).values()
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
      exportRecordsAndColumns,
      DEFAULT_COLUMNS,
      isProduct
    ),
    templateAdditionalHeaders: []
  };
}

// PIM repo ProductPQLHelper.getRecordByCategory()
async function getRecordByCategory(
  pqlBuilder,
  isPrimaryCategory,
  isProduct = true
) {
  if (pqlBuilder.objectId === null) {
    throw 'Category Id is blank or null';
  }

  // get base structure
  let cm = {
    allChildrenIds: new Set(),
    allParentIds: new Set(),
    startingCategoryId: pqlBuilder.objectId
  };
  let childrenIds = await getAllChildrenIds(cm);
  if (childrenIds.size === 0) {
    throw 'No Category Ids';
  }
  const listCategoryIds = prepareIdsForSOQL(childrenIds);
  isPrimaryCategory =
    !isProduct || (await getCategoryPrimaryStatus(pqlBuilder.objectId)); //TODO PASS IN ISDA
  let pm;
  if (isPrimaryCategory) {
    pm = await buildStructureWithCategoryIds(listCategoryIds, isProduct);
  } else {
    pm = await buildStructureWithSecondaryCategoryIds(listCategoryIds);
  }
  let tempRecords = await PimRecordService(pm, helper, service);
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
async function buildStructureWithCategoryIds(
  listCategoryIds,
  isProduct = true
) {
  if (listCategoryIds.size === 0) {
    throw 'No Category Ids';
  }
  // return list of records
  return await service.simpleQuery(
    helper.namespaceQuery(
      `select Id, Name, Category__c, Category__r.Name, ${
        isProduct ? 'Completeness_Score__c,' : 'CreatedDate, Asset_Status__c, External_File_Id__c, Mime_Type__c, Size__c, View_Link__c,'
      }
      (
        select
            Id,
            Name,
            Attribute_Label__c,
            Attribute_Label__r.Attribute_Group__r.Name,
            Attribute_Label__r.Attribute_Group__r.Attribute_Tab__r.Name,
            Attribute_Label__r.Label__c,
            Attribute_Label__r.Primary_Key__c,
            Attribute_Label__r.Type__c,
            Overwritten_Variant_Value__c,
            Overwritten_Variant_Value__r.Label__c,
            Overwritten_Variant_Value__r.Name,
            Overwritten_Variant_Value__r.Parent_Value_Path__c,
            Value__c,
            Value_Long__c,
            Numeric_Value__c
        from Attributes__r
        order by Attribute_Label__r.Order__c asc
      )
      ${
        isProduct
          ? `,(
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
      from Product__c`
          : ` from Digital_Asset__c`
      }
      where Category__c IN (${listCategoryIds})`
    )
  );
}

// PIM repo ProductManager.buildStructureWithSecondaryCategoryIds()
async function buildStructureWithSecondaryCategoryIds(listCategoryIds) {
  if (listCategoryIds.size === 0) {
    throw 'No Category Ids';
  }
  let links = await service.simpleQuery(
    helper.namespaceQuery(
      `select Id, Product__c
      from Alternate_Category_Link__c
      where Alternate_Category__c IN (${listCategoryIds})`
    )
  );

  if (links.length > 0) {
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
            Attribute_Label__r.Primary_Key__c,
            Attribute_Label__r.Type__c,
            Overwritten_Variant_Value__c,
            Overwritten_Variant_Value__r.Label__c,
            Overwritten_Variant_Value__r.Name,
            Overwritten_Variant_Value__r.Parent_Value_Path__c,
            Value__c,
            Value_Long__c,
            Numeric_Value__c
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

// PIM repo ProductManager.getRecordMap
async function getRecordMap(recordList) {
  let recordMap = new Map();
  recordList.forEach(record => {
    recordMap.set(record.Id, record);
  });
  return recordMap;
}

// PIM repo ProductService.getResultForProductMap
async function getAttributesForRecordMap(
  recordMap,
  variantValueIds,
  recordList,
  reqBody,
  digitalAssetMap,
  daDownloadDetailsList
) {
  let results = new Map();
  let tempMap = new Map();
  let variantToAttributeMap = await getVariantMap(recordList);

  for (let record of Array.from(recordMap.values())) {
    tempMap = new Map();
    if (helper.getValue(record, 'Attributes__r') === null) continue;

    for (let attribute of helper.getValue(record, 'Attributes__r').records) {
      if (
        helper.getValue(attribute, 'Overwritten_Variant_Value__c') !== null ||
        helper.getValue(attribute, 'Attribute_Label__r') === null
      ) {
        continue;
      }

      let attrValValue = helper.getAttributeValueValue(attribute);
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
      } else if (
        helper.getValue(attribute, 'Attribute_Label__r.Type__c') ===
        PRODUCT_REFERENCE_TYPE
      ) {
        attrValValue = await parseProductReferenceAttrVal(
          attrValValue,
          reqBody
        );
      }
      tempMap.set(
        helper.getValue(attribute, 'Attribute_Label__r.Primary_Key__c'),
        attrValValue
      );
    }
    results.set(record.Id, tempMap);
  }

  let variantValueDetailMap = await getVariantValueDetailMap(recordList);
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
          if ( helper.getValue(attribute, 'Attribute_Label__r') === null ) {
            continue;
          }
          let attrValValue = helper.getAttributeValueValue(attribute);
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
          } else if (
            helper.getValue(attribute, 'Attribute_Label__r.Type__c') ===
            PRODUCT_REFERENCE_TYPE
          ) {
            attrValValue = await parseProductReferenceAttrVal(
              attrValValue,
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
        if (!helper.getValue(attribute, 'Attribute_Label__r')) {
          continue;
        }

        let attrValValue = helper.getAttributeValueValue(attribute);
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
        } else if (
          helper.getValue(attribute, 'Attribute_Label__r.Type__c') ===
          PRODUCT_REFERENCE_TYPE
        ) {
          attrValValue = await parseProductReferenceAttrVal(
            attrValValue,
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
  let currentValue
  productsList.forEach(product => {
    if (helper.getValue(product, 'Attributes__r') !== null) {
      helper.getValue(product, 'Attributes__r').records.forEach(attribute => {
        currentValue = helper.getValue(attribute, 'Overwritten_Variant_Value__c')
        // iterate through each product's Attribute_Value__c
        if ( currentValue !== null ) {
          // if the Attribute_Value__c (e.g. 4kg) belongs to a variant (e.g. AC-SWSH-1001-BLK-M)
          if ( variantMap.has(currentValue) ) {
            // add on the Attribute_Value__c to the list of attribute values belonging to the variant
            variantMap.get(currentValue).push(attribute)
          } else {
            // instantiate the list of attribute values
            variantMap.set( currentValue, [attribute] );
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
  exportRecordsAndColumns,
  defaultColumns,
  isProduct = true
) {
  let exportColumns = [];
  let templateHeaderValueMap = new Map();

  // populate default columns first if not templated export
  if (!templateFields || templateFields.length === 0) {
    Array.from(defaultColumns.keys()).forEach(defaultCol => {
      if (!isProduct && defaultCol === 'Title') return;
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
  let columnAttributeIds = new Set();
  let hasDefaultAssetCols = false;
  if (linkedAttributes.length > 0) {
    linkedAttributes.forEach(attr => {
      columnAttributeIds.add(attr);
    });
  }
  if (linkedGroups.length > 0) {
    linkedGroups = prepareIdsForSOQL(linkedGroups);
    await addChildrenOfLinkedGroups(linkedGroups, columnAttributeIds);
    if (!isProduct) {
      // check if "System Attributes" attribute group is selected and slate those for export
      hasDefaultAssetCols = await checkForDefaultAssetCols(exportColumns, linkedGroups);
    }
  }
  if (columnAttributeIds.size > 0 || hasDefaultAssetCols) {
    // specific attributes/attribute groups/system attributes have been selected
    columnAttributeIds = Array.from(columnAttributeIds);
    columnAttributeIds = prepareIdsForSOQL(columnAttributeIds);

    // get SOQL query for Label__c of all attribute labels
    const columnAttributes = await service.simpleQuery(
      helper.namespaceQuery(
        `select Id, Label__c, Primary_Key__c
        from Attribute_Label__c
        where Classification__c = '${
          isProduct ? 'Product' : 'Digital Asset'
        }' AND Id IN (${columnAttributeIds})`
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
      where Classification__c = '${
        isProduct ? 'Product' : 'Digital Asset'
      }' order by Primary_Key__c`
      )
    );

    if (!templateFields || templateFields.length === 0) {
      // if not template export, push all attribute columns and default asset columns (if is asset)
      columnAttributes.forEach(attr => {
        exportColumns.push({
          fieldName: helper.getValue(attr, 'Primary_Key__c'),
          label: helper.getValue(attr, 'Label__c'),
          type: 'text'
        });
      });
      if (!isProduct) {
        addDefaultAssetColsForExport(exportColumns, linkedGroups);
      }
    } else if (templateFields && templateFields.length > 0) {
      // add columns specified in template
      let field;
      let isAttributeField;
      let isDefaultColumn;
      const defaultColumnNames = Array.from(defaultColumns.keys());
      const lastHeaderRowIndex = templateHeaders.length - 1;
      const numOfColumnAttributes = columnAttributes.length;
      let missedCount;
      for (let i = 0; i < templateFields.length; i++) {
        field = templateFields[i];
        isAttributeField = field.includes(ATTRIBUTE_FLAG);
        isDefaultColumn = defaultColumnNames.includes(field.slice(11, -1));
        if (isAttributeField && isProduct && isDefaultColumn) {
          // value specified in template is a field's value, and col in template is a default product column
          field = field.slice(11, -1);
          exportColumns.push({
            fieldName: defaultColumns.get(field),
            label: templateHeaders[lastHeaderRowIndex][i],
            type: 'text'
          });
        } else if (isAttributeField && !isDefaultColumn) {
          // value specified in template is a field's value, and col in template is an attribute column
          field = field.slice(11, -1);
          missedCount = 0;
          for (let colAttr of columnAttributes) {
            if (field === helper.getValue(colAttr, 'Label__c') || field === helper.getValue(colAttr, 'Primary_Key__c')) {
              exportColumns.push({
                fieldName: helper.getValue(colAttr, 'Primary_Key__c'),
                label: templateHeaders[lastHeaderRowIndex][i],
                type: 'text'
              });
              break;
            }
            missedCount++;
            if (missedCount === numOfColumnAttributes - 1) {
              // Invalid attribute field
              templateHeaderValueMap.set(
                templateHeaders[lastHeaderRowIndex][i],
                ''
              );
              exportColumns.push({
                fieldName: templateHeaders[lastHeaderRowIndex][i],
                label: templateHeaders[lastHeaderRowIndex][i],
                type: 'text'
              });
            }
          }
        } else if (!isAttributeField) {
          // col's value specified in template is a raw value
          templateHeaderValueMap.set(
            templateHeaders[lastHeaderRowIndex][i],
            field
          );
          exportColumns.push({
            fieldName: templateHeaders[lastHeaderRowIndex][i],
            label: templateHeaders[lastHeaderRowIndex][i],
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

async function addChildrenOfLinkedGroups(linkedGroups, columnAttributeIds) {
  const linkedGroupsChildren = await service.simpleQuery(
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

// iterate through selected attribute groups, if System Attributes is selected, add default asset columns
async function checkForDefaultAssetCols(exportColumns, linkedGroups) {
  const linkedGroupObjects = await service.simpleQuery(
    helper.namespaceQuery(
      `select Id, Name
      from Attribute_Group__c
      where Id IN (${linkedGroups})`
    )
  );
  for (let linkedGroupObj of linkedGroupObjects) {
    if (linkedGroupObj.Name === SYSTEM_ATTRIBUTES_LABEL) {
      await addDefaultAssetColsForExport(exportColumns);
      return true;
    }
  }
  return false;
}

async function addDefaultAssetColsForExport(exportColumns) {
  Array.from(DEFAULT_ASSET_COLUMNS.keys()).forEach(defaultCol => {
    exportColumns.push({
      fieldName: DEFAULT_ASSET_COLUMNS.get(defaultCol),
      label: defaultCol,
      type: 'text'
    });
  });
}

async function populateRecordDetailsForLowestVariants(lowestVariants) {
  let recordMapList = [];
  let recordMap;
  for (let lowestVariant of lowestVariants) {
    recordMap = new Map();
    recordMap.set('Id', lowestVariant.Id);
    recordMap.set('Record_ID', lowestVariant.Name);
    recordMap.set('Category__c', helper.getValue(lowestVariant, 'Variant__r.Product__r.Category__c'));
    recordMap.set(
      'Category__r.Name',
      helper.getValue(lowestVariant, 'Variant__r.Product__r.Category__r.Name')
    );
    recordMap.set(
      'Title',
      helper.getValue(lowestVariant, 'Label__c')
        ? helper.getValue(lowestVariant, 'Label__c')
        : lowestVariant.Name
    );
    recordMap.set('Parent_ID', helper.getValue(lowestVariant, 'Variant__r.Product__c'));
    recordMapList.push(recordMap);
  }

  return recordMapList;
}

module.exports = PimRecordListHelper;
