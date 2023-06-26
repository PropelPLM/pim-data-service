const PimRecordManager = require('./PimRecordManager');
const PimRecordService = require('./PimRecordService');
const PimRecordListHelper = require('./PimRecordListHelper');
const PimExportHelper = require('./PimExportHelper');
const ForceService = require('./ForceService');
const {
  ATTRIBUTE_FLAG,
  PRODUCT_TYPE,
  callAsposeToExport,
  getLowestVariantValuesList,
  getDigitalAssetMap,
  initAssetDownloadDetailsList,
  parseDigitalAssetAttrVal,
  parseDaAttrValWithVarMap,
  prepareIdsForSOQL,
  parseProductReferenceAttrVal
} = require('./utils');

let helper;
let service;
const CATEGORY_ID_FIELD = 'Category__c';
const CATEGORY_NAME_FIELD = 'Category__r.Name';
const CATEGORY_NAME_LABEL = 'Category';
const DA_TYPE = 'DigitalAsset';
const ID_FIELD = 'Id';
const PRODUCT_REFERENCE_TYPE = 'ProductReference';
const RECORD_ID_FIELD = 'Record_ID';
const RECORD_ID_LABEL = 'Record ID';

class PimStructure {
  constructor() {}

  // fetch the PIM products and variants here so we dont have to do it in Apex
  async build(reqBody, isListPageExport) {
    service = new ForceService(reqBody.hostUrl, reqBody.sessionId);

    let exportRecordsColsAndAssets = {};
    const recordIds = prepareIdsForSOQL(reqBody.recordIds);
    const { exportType, includeRecordAsset, namespace } = reqBody;
    helper = new PimExportHelper(namespace);
    const digitalAssetMap = await getDigitalAssetMap(service, helper);

    const asposeInput = { reqBody };
    const isProduct = reqBody.recordType == PRODUCT_TYPE;
    let currentVariantName,
      templateFields,
      templateHeaders,
      useAspose,
      // daDownloadDetailsList;
      productVariantsDaDetailsMap;
    if (reqBody.options.isTemplateExport) {
      if (reqBody.templateVersionData) {
        ({ templateFields, templateHeaders } = this.getTemplateHeadersAndFields(
          reqBody.templateVersionData
        ));
      } else if (reqBody.templateContentVersionId) {
        useAspose = true;
      }
    }

    if (isListPageExport) {
      // export is from list page
      exportRecordsColsAndAssets = await PimRecordListHelper(
        reqBody,
        helper,
        service,
        templateFields,
        templateHeaders,
        digitalAssetMap,
        isProduct
      );
      Object.assign(asposeInput, {
        listPageData: exportRecordsColsAndAssets?.recordsAndCols[0]
      });
    } else {
      // export is from detail data page
      /** PIM repo ProductService.getProductById start */
      // PIM repo ProductManager.buildWithProductIds
      let { appearingLabelIds } = reqBody;
      let recordList = await PimRecordManager(
          recordIds,
          helper,
          service,
          isProduct
        ),
        productVariantValueMapList = await PimRecordService(
          recordList,
          helper,
          service,
          isProduct
        ),
        baseRecord = productVariantValueMapList[0],
        exportRecords = [baseRecord],
        exportRecordsAndColumns = [exportRecords],
        attrValValue;
      // daDownloadDetailsList = initAssetDownloadDetailsList(
      //   isProduct,
      //   includeRecordAsset,
      //   recordList.map(record => record.Id),
      //   digitalAssetMap,
      //   namespace
      // );

      // Map<productId or vvId, Map<Attribute Label Id, DADownloadDetails object>>
      productVariantsDaDetailsMap = new Map();
      appearingLabelIds = prepareIdsForSOQL(appearingLabelIds);
      const { appearingLabels, appearingValues } =
        await this.parseAppearringAttrLabelsAndValues(
          appearingLabelIds,
          service
        );
      for (let i = 0; i < appearingLabels.length; i++) {
        // add the base product's attribute values
        for (let j = 0; j < appearingValues.length; j++) {
          if (
            helper.getValue(appearingValues[j], 'Attribute_Label__c') !==
              appearingLabels[i].Id ||
            (helper.getValue(appearingValues[j], 'Product__c') !==
              baseRecord.get('Id') &&
              helper.getValue(appearingValues[j], 'Digital_Asset__c') !==
                baseRecord.get('Id'))
          )
            continue;
          attrValValue = helper.getValue(appearingValues[j], 'Value__c');
          if (
            helper.getValue(appearingValues[j], 'Attribute_Label_Type__c') ===
            DA_TYPE
          ) {
            // attrValValue = await parseDigitalAssetAttrVal(
            //   digitalAssetMap,
            //   attrValValue,
            //   daDownloadDetailsList,
            //   helper,
            //   reqBody
            // );
            attrValValue = await parseDaAttrValWithVarMap(
              baseRecord.get('Id'),
              digitalAssetMap,
              appearingLabels[i].Id,
              attrValValue,
              productVariantsDaDetailsMap,
              helper,
              reqBody
            );
            console.log(
              'productVariantsDaDetailsMap: ',
              productVariantsDaDetailsMap
            );
          } else if (
            helper.getValue(appearingValues[j], 'Attribute_Label_Type__c') ===
            PRODUCT_REFERENCE_TYPE
          ) {
            attrValValue = await parseProductReferenceAttrVal(
              attrValValue,
              reqBody
            );
          }
          exportRecords[0].set(appearingLabels[i].Name, attrValValue);
        }

        if (!exportRecords[0].has(appearingLabels[i].Name)) {
          // add null value to the base product map
          exportRecords[0].set(appearingLabels[i].Name, null);
        }
      }
      /** get product's appearing attribute labels end */
      if (isProduct) {
        let valuesList = [];

        if (exportType === 'currentVariant') {
          if (reqBody.variantValuePath.length > 0) {
            // exporting current variant value (base product not included in export)
            // remove base product's digital assets that were previously added
            daDownloadDetailsList = [];
            const variantValuePath = prepareIdsForSOQL(
              reqBody.variantValuePath
            );
            // get Variant__c object and Variant_Value__c object for every variant value in current variant
            const variantAndValueMap = await this.getVariantAndVariantValues(
              variantValuePath,
              exportType,
              namespace
            );

            let currentVariant = new Map();
            const varList = Array.from(variantAndValueMap.keys());
            valuesList = Array.from(variantAndValueMap.values()); // note: this is an array of arrays
            let valuesIdList = [];
            valuesList.forEach(val => {
              valuesIdList.push(val[0].Id);
            });
            valuesIdList = prepareIdsForSOQL(valuesIdList);
            let overwrittenValues = [];
            if (valuesIdList.length > 0) {
              overwrittenValues = await service.simpleQuery(
                helper.namespaceQuery(
                  `select Id, Attribute_Label__c, Attribute_Label_Type__c, Value__c, Product__c, Overwritten_Variant_Value__c
                  from Attribute_Value__c
                  where (
                    Overwritten_Variant_Value__c IN (${valuesIdList}) AND
                    Product__c IN (${recordIds}) AND
                    Attribute_Label__c IN (${appearingLabelIds})
                  )`
                )
              );
            }

            // add variant values to the current variant product
            for (let i = 0; i < varList.length; i++) {
              currentVariant.set('Record_ID', valuesList[i][0].Name);
              currentVariant.set(
                varList[i].Name,
                helper.getValue(valuesList[i][0], 'Label__c')
              );

              // add any overwritten values
              if (overwrittenValues.length > 0) {
                for (let j = 0; j < overwrittenValues.length; j++) {
                  let affectedLabelName;
                  appearingLabels.forEach(label => {
                    if (
                      label.Id ===
                      helper.getValue(
                        overwrittenValues[j],
                        'Attribute_Label__c'
                      )
                    ) {
                      affectedLabelName = label.Name;
                    }
                  });
                  const affectedVariantValue = helper.getValue(
                    overwrittenValues[j],
                    'Overwritten_Variant_Value__c'
                  );
                  let newValue = helper.getValue(
                    overwrittenValues[j],
                    'Value__c'
                  );
                  if (
                    helper.getValue(
                      overwrittenValues[j],
                      'Attribute_Label_Type__c'
                    ) === DA_TYPE
                  ) {
                    newValue = await parseDigitalAssetAttrVal(
                      digitalAssetMap,
                      newValue,
                      daDownloadDetailsList,
                      helper,
                      reqBody
                    );
                  } else if (
                    helper.getValue(
                      overwrittenValues[j],
                      'Attribute_Label_Type__c'
                    ) === PRODUCT_REFERENCE_TYPE
                  ) {
                    newValue = await parseProductReferenceAttrVal(
                      newValue,
                      reqBody
                    );
                  }
                  // update the currentVariant object with the overwritten values
                  if (valuesList[i][0].Id === affectedVariantValue) {
                    currentVariant.set(affectedLabelName, newValue);
                  }
                }
              }
            }
            currentVariantName = currentVariant.get('Record_ID');
            // overwrite base product with current variant
            exportRecords = [currentVariant];
          }
        } else if (
          exportType === 'allVariants' ||
          exportType === 'lowestVariants'
        ) {
          let variantValueIds = '';
          // get ids of all variant values as comma separated String (skip first element since that is a product, not variant)
          for (let i = 1; i < productVariantValueMapList.length; i++) {
            if (i === 1) {
              variantValueIds += String(
                productVariantValueMapList[i].get('Id')
              );
            } else {
              variantValueIds +=
                ', ' + String(productVariantValueMapList[i].get('Id'));
            }
          }

          // add a new entry in exportRecords for each possible variant
          const variantAndValueListMap = await this.getVariantAndVariantValues(
            variantValueIds,
            exportType,
            namespace
          );
          let newVariant = new Map();
          let varList = Array.from(variantAndValueListMap.keys());
          valuesList = [];
          Array.from(variantAndValueListMap.values()).forEach(valList => {
            valuesList.push.apply(valuesList, valList); // flatten array
          });
          let valuesIdList = [];
          valuesList.forEach(val => {
            valuesIdList.push(val.Id);
          });
          valuesIdList = prepareIdsForSOQL(valuesIdList);
          let overwrittenValues = [];
          if (valuesIdList.length > 0) {
            overwrittenValues = await service.simpleQuery(
              helper.namespaceQuery(
                `select Id, Attribute_Label__c, Attribute_Label_Type__c, Value__c, Product__c, Overwritten_Variant_Value__c
                from Attribute_Value__c
                where (
                  Overwritten_Variant_Value__c IN (${valuesIdList}) AND
                  Product__c IN (${recordIds}) AND
                  Attribute_Label__c IN (${appearingLabelIds})
                )`
              )
            );
          }

          let currValue;
          let isFirstLevelVariant;
          for (let i = 0; i < valuesList.length; i++) {
            newVariant = new Map();
            currValue = valuesList[i];
            isFirstLevelVariant = true;
            while (true) {
              // add variant value's Record ID
              if (isFirstLevelVariant) {
                newVariant.set('Record_ID', currValue.Name);
                isFirstLevelVariant = false;
              }
              // add Variant__c's Label (e.g. for Variant 'Size', Label is 'Large')
              for (let j = 0; j < varList.length; j++) {
                if (
                  varList[j].Id === helper.getValue(currValue, 'Variant__c')
                ) {
                  newVariant.set(
                    varList[j].Name,
                    helper.getValue(currValue, 'Label__c')
                  );
                }
              }
              // loop through the parent value path to repeat this iteratively
              // required as each variant value only contains 1 variant label so the variant label inherited from its parent has to be retrieved from the parent
              if (
                helper.getValue(currValue, 'Parent_Variant_Value__c') != null
              ) {
                for (const parentValue of valuesList) {
                  if (
                    parentValue.Id ===
                    helper.getValue(currValue, 'Parent_Variant_Value__c')
                  ) {
                    currValue = parentValue;
                    break;
                  }
                }
              } else {
                break;
              }
            }

            // add any overwritten values
            if (overwrittenValues.length > 0) {
              for (let j = 0; j < overwrittenValues.length; j++) {
                let affectedLabelName;
                appearingLabels.forEach(label => {
                  if (
                    label.Id ===
                    helper.getValue(overwrittenValues[j], 'Attribute_Label__c')
                  ) {
                    affectedLabelName = label.Name;
                  }
                });
                const affectedVariantValue = helper.getValue(
                  overwrittenValues[j],
                  'Overwritten_Variant_Value__c'
                );
                let newValue = helper.getValue(
                  overwrittenValues[j],
                  'Value__c'
                );
                if (
                  helper.getValue(
                    overwrittenValues[j],
                    'Attribute_Label_Type__c'
                  ) === DA_TYPE
                ) {
                  newValue = await parseDigitalAssetAttrVal(
                    digitalAssetMap,
                    newValue,
                    daDownloadDetailsList,
                    helper,
                    reqBody
                  );
                } else if (
                  helper.getValue(
                    overwrittenValues[j],
                    'Attribute_Label_Type__c'
                  ) === PRODUCT_REFERENCE_TYPE
                ) {
                  newValue = await parseProductReferenceAttrVal(
                    newValue,
                    reqBody
                  );
                }
                // update the newVariant object with the overwritten values
                if (valuesList[i].Id === affectedVariantValue) {
                  newVariant.set(affectedLabelName, newValue);
                }
              }
            }
            if (exportType === 'lowestVariants' && !reqBody.isInherited) {
              const lowestLevelVariantValues = await getLowestVariantValuesList(
                valuesList,
                reqBody.namespace
              );
              // push only the lowest level variant values (i.e. SKUs)
              lowestLevelVariantValues.forEach(vvId => {
                if (newVariant.get('Record_ID') === vvId) {
                  exportRecords.push(newVariant);
                }
              });
            } else {
              exportRecords.push(newVariant);
            }
          }
        } else {
          throw 'Invalid Export Type';
        }

        if (reqBody.isInherited) {
          exportRecordsAndColumns = [
            await this.fillInInheritedData(
              baseRecord,
              exportRecords,
              valuesList,
              exportType,
              productVariantValueMapList,
              recordIds,
              appearingLabelIds,
              appearingLabels,
              currentVariantName,
              reqBody,
              digitalAssetMap,
              daDownloadDetailsList
            )
          ];
        } else if (exportType === 'lowestVariants') {
          // remove base product from list of lowest variants
          exportRecordsAndColumns = [exportRecords.slice(1)];
        } else {
          exportRecordsAndColumns = [exportRecords];
        }
      }
      exportRecordsColsAndAssets = {
        daDownloadDetailsList,
        recordsAndCols: await this.addExportColumns(
          productVariantValueMapList,
          templateFields,
          templateHeaders,
          exportRecordsAndColumns
        ),
        templateAdditionalHeaders: []
      };
      Object.assign(asposeInput, {
        detailPageData: exportRecordsColsAndAssets?.recordsAndCols[0],
        baseRecord
      });
    }
    if (useAspose) {
      await callAsposeToExport(asposeInput);
      return { daDownloadDetailsList };
    }
    if (templateHeaders?.length > 1) {
      // template has more than 1 header row, pop the last header row as it is already tied to the data row
      templateHeaders.pop();
      exportRecordsColsAndAssets.templateAdditionalHeaders = templateHeaders;
    }
    return exportRecordsColsAndAssets;
  }

  // PIM repo ProductService.getVariantAndVariantValues
  async getVariantAndVariantValues(variantValueIds, exportType) {
    let valueIds = [];
    variantValueIds.split(', ').forEach(id => {
      valueIds.push(id);
    });
    valueIds =
      exportType === 'allVariants' || exportType === 'lowestVariants'
        ? prepareIdsForSOQL(valueIds)
        : valueIds;
    let returnMap = new Map();
    let values = await service.simpleQuery(
      helper.namespaceQuery(
        `select
          Id,
          Name,
          Label__c,
          Parent_Value_Path__c,
          Parent_Variant_Value__c,
          Variant__c,
          Variant__r.Name
        from Variant_Value__c
        where Id IN (${valueIds})`
      )
    );

    let tempVariant;
    values.forEach(value => {
      tempVariant = {
        Id: helper.getValue(value, 'Variant__c'),
        Name: helper.getValue(value, 'Variant__r').Name
      };
      if (returnMap.has(tempVariant)) {
        returnMap.set(tempVariant, [...returnMap.get(tempVariant), value]);
      } else {
        returnMap.set(tempVariant, [value]);
      }
    });
    return returnMap;
  }

  async fillInInheritedData(
    baseProduct,
    exportRecords,
    valuesList,
    exportType,
    productVariantValueMapList,
    recordIds,
    appearingLabelIds,
    appearingLabels,
    currentVariantName,
    reqBody,
    digitalAssetMap,
    daDownloadDetailsList
  ) {
    let lowestLevelVariantValues;
    if (exportType === 'currentVariant') {
      console.log('reqBody.variantValuePath: ', reqBody.variantValuePath);
      exportType = 'allVariants';
      exportRecords = [baseProduct];
      // query all variants to populate inherited values
      const variantValueArray = new Array();
      let variantValueIds = '';
      // get ids of all variant values as comma separated String (skip first element since that is a product, not variant)
      for (let i = 1; i < productVariantValueMapList.length; i++) {
        variantValueArray.push(String(productVariantValueMapList[i].get('Id')));
      }
      variantValueIds = variantValueArray.join(', ');

      // add a new entry in exportRecords for each possible variant
      const variantAndValueListMap = await this.getVariantAndVariantValues(
        variantValueIds,
        exportType
      );
      let newVariant = new Map();
      let varList = Array.from(variantAndValueListMap.keys());
      valuesList = [];
      Array.from(variantAndValueListMap.values()).forEach(valList => {
        valuesList.push.apply(valuesList, valList); // flatten array
      });
      let valuesIdList = [];
      valuesList.forEach(val => {
        valuesIdList.push(val.Id);
      });
      valuesIdList = prepareIdsForSOQL(valuesIdList);
      let overwrittenValues = [];
      if (valuesIdList.length > 0) {
        overwrittenValues = await service.simpleQuery(
          helper.namespaceQuery(
            `select Id, Attribute_Label__c, Attribute_Label_Type__c, Value__c, Product__c, Overwritten_Variant_Value__c
            from Attribute_Value__c
            where (
              Overwritten_Variant_Value__c IN (${valuesIdList}) AND
              Product__c IN (${recordIds}) AND
              Attribute_Label__c IN (${appearingLabelIds})
            )`
          )
        );
      }

      let currValue;
      let isFirstLevelVariant;
      for (let i = 0; i < valuesList.length; i++) {
        newVariant = new Map();
        currValue = valuesList[i];
        isFirstLevelVariant = true;
        while (true) {
          // add variant value's Record ID
          if (isFirstLevelVariant) {
            newVariant.set('Record_ID', currValue.Name);
            isFirstLevelVariant = false;
          }
          // add Variant__c's Label
          for (let j = 0; j < varList.length; j++) {
            if (varList[j].Id === helper.getValue(currValue, 'Variant__c')) {
              newVariant.set(
                varList[j].Name,
                helper.getValue(currValue, 'Label__c')
              );
            }
          }
          // loop through the parent value path to repeat this iteratively
          if (helper.getValue(currValue, 'Parent_Variant_Value__c') != null) {
            for (const parentValue of valuesList) {
              if (
                parentValue.Id ===
                helper.getValue(currValue, 'Parent_Variant_Value__c')
              ) {
                currValue = parentValue;
                break;
              }
            }
          } else {
            break;
          }
        }

        // add any overwritten values
        if (overwrittenValues.length > 0) {
          for (let j = 0; j < overwrittenValues.length; j++) {
            let affectedLabelName;
            appearingLabels.forEach(label => {
              if (
                label.Id ===
                helper.getValue(overwrittenValues[j], 'Attribute_Label__c')
              ) {
                affectedLabelName = label.Name;
              }
            });
            const affectedVariantValue = helper.getValue(
              overwrittenValues[j],
              'Overwritten_Variant_Value__c'
            );
            let newValue = helper.getValue(overwrittenValues[j], 'Value__c');
            if (
              helper.getValue(
                overwrittenValues[j],
                'Attribute_Label_Type__c'
              ) === DA_TYPE
            ) {
              newValue = await parseDigitalAssetAttrVal(
                digitalAssetMap,
                newValue,
                daDownloadDetailsList,
                helper,
                reqBody
              );
            } else if (
              helper.getValue(
                overwrittenValues[j],
                'Attribute_Label_Type__c'
              ) === PRODUCT_REFERENCE_TYPE
            ) {
              newValue = await parseProductReferenceAttrVal(newValue, reqBody);
            }
            // update the newVariant object with the overwritten values
            if (valuesList[i].Id === affectedVariantValue) {
              newVariant.set(affectedLabelName, newValue);
            }
          }
        }
        exportRecords.push(newVariant);
      }
      exportType = 'currentVariant';
    } else if (exportType === 'lowestVariants') {
      lowestLevelVariantValues = await getLowestVariantValuesList(
        valuesList,
        reqBody.namespace
      );
    }
    let variantValueTree = await this.createVariantValueTree(
        valuesList,
        baseProduct
      ),
      filledInExportRecords = [exportRecords.shift()],
      baseProductData = new Map();
    Array.from(baseProduct.keys()).forEach(key => {
      if (baseProduct.get(key) != null && baseProduct.get(key) != '') {
        // baseProduct has value for that attribute
        baseProductData.set(key, baseProduct.get(key));
      }
    });

    // loop through baseProduct's children to settle inheritance from base product
    variantValueTree
      .get(baseProduct.get('Record_ID'))
      .forEach(firstLevelVariant => {
        exportRecords.forEach(variant => {
          if (variant.get('Record_ID') === firstLevelVariant) {
            Array.from(baseProductData.keys()).forEach(key => {
              if (
                !variant.has(key) ||
                (variant.has(key) &&
                  (variant.get(key) === null || variant.get(key) === ''))
              ) {
                // variant has no variant value for that attribute, set its value to be the base product's attribute value
                variant.set(key, baseProductData.get(key));
              }
            });
            if (
              exportType === 'allVariants' ||
              (exportType === 'currentVariant' &&
                currentVariantName === variant.get('Record_ID'))
            ) {
              filledInExportRecords.push(variant);
            } else if (exportType === 'lowestVariants') {
              // push only the lowest level variant values (i.e. SKUs)
              lowestLevelVariantValues.forEach(vvId => {
                if (variant.get('Record_ID') === vvId) {
                  filledInExportRecords.push(variant);
                }
              });
            }
          }
        });
      });

    // loop through each variant (top down) to settle inheritance from parent variants
    exportRecords.forEach(variant => {
      variantValueTree.get(variant.get('Record_ID')).forEach(childVariant => {
        exportRecords.forEach(variantValue => {
          if (variantValue.get('Record_ID') === childVariant) {
            Array.from(variant.keys()).forEach(key => {
              if (
                !variantValue.has(key) ||
                (variantValue.has(key) &&
                  (variantValue.get(key) === null ||
                    variantValue.get(key) === ''))
              ) {
                // variantValue has no value for that attribute, set its value to be the base product's attribute value
                variantValue.set(key, variant.get(key));
              }
            });
            if (
              exportType === 'allVariants' ||
              (exportType === 'currentVariant' &&
                currentVariantName === variantValue.get('Record_ID'))
            ) {
              filledInExportRecords.push(variantValue);
            } else if (exportType === 'lowestVariants') {
              // push only the lowest level variant values (i.e. SKUs)
              lowestLevelVariantValues.forEach(vvId => {
                if (variantValue.get('Record_ID') === vvId) {
                  filledInExportRecords.push(variantValue);
                }
              });
            }
          }
        });
      });
    });
    // remove base product from SKU export or current variant export (if current record is not base product)
    return (exportType === 'currentVariant' &&
      reqBody.variantValuePath.length > 0) ||
      exportType === 'lowestVariants'
      ? filledInExportRecords.slice(1)
      : filledInExportRecords;
  }

  async createVariantValueTree(valuesList, baseProduct) {
    let variantValueTree = [];
    let treeNode;

    // add root node for baseProduct
    treeNode = new Map();
    treeNode.set('Record_ID', baseProduct.get('Record_ID'));
    treeNode.set('Id', baseProduct.get('Id'));
    treeNode.set('Children', []);
    variantValueTree.push(treeNode);

    // add nodes for variants
    valuesList.forEach(value => {
      treeNode = new Map();
      treeNode.set('Record_ID', value.Name);
      treeNode.set('Id', value.Id);
      treeNode.set('Children', []);
      if (helper.getValue(value, 'Parent_Variant_Value__c')) {
        const parentId = helper.getValue(value, 'Parent_Variant_Value__c');
        // add current variant value's id to the list of children in its parent in variantValueTree
        variantValueTree.forEach(node => {
          if (node.get('Id') === parentId) {
            let childrenList = node.get('Children');
            childrenList.push(value.Name);
            node.set('Children', childrenList);
          }
        });
      } else {
        // add current variant value's id to the list of children in baseProduct in variantValueTree
        let childrenList = variantValueTree[0].get('Children');
        childrenList.push(value.Name);
        variantValueTree[0].set('Children', childrenList);
      }
      variantValueTree.push(treeNode);
    });

    // convert the data structure to reduce search overhead
    let childMap = new Map();
    variantValueTree.forEach(variant => {
      childMap.set(variant.get('Record_ID'), variant.get('Children'));
    });
    return childMap;
  }

  async addExportColumns(
    productVariantValueMapList,
    templateFields,
    templateHeaders,
    exportRecordsAndColumns
  ) {
    let exportColumns = [];
    let templateHeaderValueMap = new Map();
    if (!templateFields || templateFields.length === 0) {
      // if not template export, push all attribute columns except sobject id and rename Category__r.Name to Category
      exportColumns = Array.from(productVariantValueMapList[0].keys())
        .filter(col => col !== ID_FIELD && col !== CATEGORY_ID_FIELD)
        .map(col => {
          if (col === CATEGORY_NAME_FIELD) {
            return { fieldName: col, label: CATEGORY_NAME_LABEL, type: 'text' };
          }
          return { fieldName: col, label: col, type: 'text' };
        });
    } else if (templateFields && templateFields.length > 0) {
      // template export
      const lastHeaderRowIndex = templateHeaders.length - 1;
      let field;
      // clean up data for easier parsing
      const supportedAttributes = productVariantValueMapList[0];
      supportedAttributes.delete(ID_FIELD);

      for (let i = 0; i < templateFields.length; i++) {
        field = templateFields[i];

        if (field.includes(ATTRIBUTE_FLAG)) {
          // template specifies that the column's rows should contain a field's value
          field = field.slice(11, -1);
          if (
            (field !== RECORD_ID_LABEL && supportedAttributes.has(field)) ||
            (field === RECORD_ID_LABEL &&
              supportedAttributes.has(RECORD_ID_FIELD))
          ) {
            // push columns specified in template
            exportColumns = [
              ...exportColumns,
              {
                fieldName: field === RECORD_ID_LABEL ? RECORD_ID_FIELD : field,
                label: templateHeaders[lastHeaderRowIndex][i],
                type: 'text'
              }
            ];
          } else {
            // invalid attribute name provided
            templateHeaderValueMap.set(
              templateHeaders[lastHeaderRowIndex][i],
              ''
            );
            exportColumns = [
              ...exportColumns,
              {
                fieldName: templateHeaders[lastHeaderRowIndex][i],
                label: templateHeaders[lastHeaderRowIndex][i],
                type: 'text'
              }
            ];
          }
        } else {
          // template specifies that the column's rows should contain the raw value in the template
          templateHeaderValueMap.set(
            templateHeaders[lastHeaderRowIndex][i],
            field
          );
          exportColumns = [
            ...exportColumns,
            {
              fieldName: templateHeaders[lastHeaderRowIndex][i],
              label: templateHeaders[lastHeaderRowIndex][i],
              type: 'text'
            }
          ];
        }
      }
      // populate export records with raw values specified in the template
      Array.from(templateHeaderValueMap.keys()).forEach(header => {
        exportRecordsAndColumns[0].forEach(recordMap => {
          recordMap.set(header, templateHeaderValueMap.get(header));
        });
      });
    }
    return [...exportRecordsAndColumns, exportColumns || []];
  }

  async parseAppearringAttrLabelsAndValues(appearingLabelIds, service) {
    // add appearing attribute labels and their values to base product
    const appearingLabels = await service.simpleQuery(
      helper.namespaceQuery(`select Id, Name
      from Attribute_Label__c
      where Id IN (${appearingLabelIds})`)
    );
    const appearingValues = await service.simpleQuery(
      helper.namespaceQuery(
        `select
          Id,
          Attribute_Label__c,
          Attribute_Label_Type__c,
          Overwritten_Variant_Value__c,
          Product__c,
          Digital_Asset__c,
          Value__c
        from Attribute_Value__c
        where (
          Attribute_Label__c IN (${appearingLabelIds}) AND
          Overwritten_Variant_Value__c = null)`
      )
    );
    return { appearingLabels, appearingValues };
  }

  convertDAToUrl(instanceUrl, namespace, sobjectId) {
    return (
      instanceUrl +
      '/lightning/r/' +
      namespace +
      'Digital_Asset__c/' +
      sobjectId +
      '/view'
    );
  }

  getTemplateHeadersAndFields(templateVersionData) {
    function removeDoubleQuotes(str) {
      // note the 3 different kinds of double quotes in the regex
      return str.replace(/["“”]+/g, '');
    }

    let templateFields;
    let templateHeaders;

    if (!templateVersionData) return { templateFields, templateHeaders };

    const templateRows = templateVersionData.split(/\r?\n/);
    let templateHeadersAndFields = {
      templateFields: [],
      templateHeaders: []
    };
    for (let row of templateRows) {
      if (row.includes(ATTRIBUTE_FLAG)) {
        templateHeadersAndFields.templateFields = row
          .split(',')
          .map(attrField => removeDoubleQuotes(attrField));
        break;
      }
      templateHeadersAndFields.templateHeaders.push(row.split(','));
    }
    return templateHeadersAndFields;
  }
}

module.exports = PimStructure;
