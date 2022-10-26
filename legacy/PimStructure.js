const PimProductManager = require('./PimProductManager');
const PimProductService = require('./PimProductService');
const PimProductListHelper = require('./PimProductListHelper');
const PimExportHelper = require('./PimExportHelper');
const ForceService = require('./ForceService');

let helper;
let service;
const ATTRIBUTE_FLAG = 'PROPEL_ATT';

// fetch the PIM products and variants here so we dont have to do it in Apex
async function PimStructure(reqBody, isListPageExport) {
  service = new ForceService(reqBody.hostUrl, reqBody.sessionId);

  let exportRecordsAndCols = [];
  const recordIds = reqBody.recordIds.map(id => `'${id}'`).join(',');
  const exportType = reqBody.exportType;
  const namespace = reqBody.namespace;
  helper = new PimExportHelper(namespace);
  let currentVariantName;

  if (isListPageExport) {
    // export is from product list page
    exportRecordsAndCols = await PimProductListHelper(reqBody, helper, service);
    return exportRecordsAndCols;
  } else {
    // export is from product data page
    /** PIM repo ProductService.getProductById start */
    // PIM repo ProductManager.buildWithProductIds
    let productsList = await PimProductManager(recordIds, helper, service);

    // PIM repo ProductService.getResultForProductStructure(productsList)
    let productVariantValueMapList = await PimProductService(
      productsList,
      helper,
      service
    );
    /** PIM repo ProductService.getProductById end */
    let baseProduct = productVariantValueMapList[0];
    let exportRecords = [baseProduct];

    /** get product's linked attribute labels start */
    const excludedLabelIds = reqBody.excludedLabelIds;
    let linkedLabelIds = [];
    const linkedGroupIds = reqBody.linkedGroupIds
      .map(id => `'${id}'`)
      .join(',');
    const linkedGroups = await service.simpleQuery(
      helper.namespaceQuery(
        `select Id, Name,
      (select
        Id,
        Name,
        Default_Value__c,
        Is_Searchable__c,
        Label__c,
        Mandatory__c,
        Max_Value__c,
        Min_Value__c,
        Order__c,
        Attribute_Group__c,
        Picklist_Values__c,
        Primary_Key__c,
        Type__c,
        UOM__c
        from Attribute_Labels__r order by Order__c )
      from Attribute_Group__c
      where Id in (${linkedGroupIds})`
      )
    );
    // add child attributes of linked attribute groups (following logic of PIM repo's ProductDetailController.generateLayout())
    linkedGroups.forEach(attrGroup => {
      if (helper.getValue(attrGroup, 'Attribute_Labels__r')) {
        helper
          .getValue(attrGroup, 'Attribute_Labels__r')
          .records.forEach(attrLabel => {
            if (!excludedLabelIds.includes(attrLabel.Id)) {
              linkedLabelIds.push(attrLabel.Id);
            }
          });
      }
    });
    // add linked attribute labels and their values to base product
    linkedLabelIds = linkedLabelIds.map(id => `'${id}'`).join(',');
    const linkedLabels = await service.simpleQuery(
      helper.namespaceQuery(`select Id, Name
      from Attribute_Label__c
      where Id IN (${linkedLabelIds})`)
    );
    const linkedValues = await service.simpleQuery(
      helper.namespaceQuery(
        `select
          Id,
          Attribute_Label__c,
          Overwritten_Variant_Value__c,
          Product__c,
          Value__c
        from Attribute_Value__c
        where (
          Attribute_Label__c IN (${linkedLabelIds}) AND
          Overwritten_Variant_Value__c = null)`
      )
    );
    linkedLabels.forEach(label => {
      // add the base product's attribute values
      linkedValues.forEach(val => {
        if (
          helper.getValue(val, 'Attribute_Label__c') === label.Id &&
          helper.getValue(val, 'Product__c') === exportRecords[0].get('Id')
        ) {
          exportRecords[0].set(label.Name, helper.getValue(val, 'Value__c'));
        }
      });

      if (!exportRecords[0].has(label.Name)) {
        // add null value to the base product map
        exportRecords[0].set(label.Name, null);
      }
    });
    /** get product's linked attribute labels end */
    let valuesList = [];

    if (exportType === 'currentVariant') {
      let variantValuePath = reqBody.variantValuePath
        .map(id => `'${id}'`)
        .join(',');
      if (variantValuePath.length > 0) {
        // get Variant__c object and Variant_Value__c object for every variant value in current variant
        const variantAndValueMap = await getVariantAndVariantValues(
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
        valuesIdList = valuesIdList.map(id => `'${id}'`).join(',');
        const overwrittenValues = await service.simpleQuery(
          helper.namespaceQuery(
            `select Id, Attribute_Label__c, Value__c, Product__c, Overwritten_Variant_Value__c
            from Attribute_Value__c
            where (
              Overwritten_Variant_Value__c IN (${valuesIdList}) AND
              Product__c IN (${recordIds}) AND
              Attribute_Label__c IN (${linkedLabelIds})
            )`
          )
        );

        // add variant values to the current variant product
        for (let i = 0; i < varList.length; i++) {
          currentVariant.set('Product_ID', valuesList[i][0].Name);
          currentVariant.set(
            varList[i].Name,
            helper.getValue(valuesList[i][0], 'Label__c')
          );

          // add any overwritten values
          if (overwrittenValues.length > 0) {
            overwrittenValues.forEach(overwrittenValue => {
              let affectedLabelName;
              linkedLabels.forEach(label => {
                if (
                  label.Id ===
                  helper.getValue(overwrittenValue, 'Attribute_Label__c')
                ) {
                  affectedLabelName = label.Name;
                }
              });
              const affectedVariantValue = helper.getValue(
                overwrittenValue,
                'Overwritten_Variant_Value__c'
              );
              const newValue = helper.getValue(overwrittenValue, 'Value__c');
              // update the currentVariant object with the overwritten values
              if (valuesList[i][0].Id === affectedVariantValue) {
                currentVariant.set(affectedLabelName, newValue);
              }
            });
          }
        }
        currentVariantName = currentVariant.get('Product_ID');
        exportRecords.push(currentVariant);
      }
    } else if (exportType === 'allVariants') {
      let variantValueIds = '';
      // get ids of all variant values as comma separated String (skip first element since that is a product, not variant)
      for (let i = 1; i < productVariantValueMapList.length; i++) {
        if (i === 1) {
          variantValueIds += String(productVariantValueMapList[i].get('Id'));
        } else {
          variantValueIds +=
            ', ' + String(productVariantValueMapList[i].get('Id'));
        }
      }

      // add a new entry in exportRecords for each possible variant
      const variantAndValueListMap = await getVariantAndVariantValues(
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
      valuesIdList = valuesIdList.map(id => `'${id}'`).join(',');
      const overwrittenValues = await service.simpleQuery(
        helper.namespaceQuery(
          `select Id, Attribute_Label__c, Value__c, Product__c, Overwritten_Variant_Value__c
          from Attribute_Value__c
          where (
            Overwritten_Variant_Value__c IN (${valuesIdList}) AND
            Product__c IN (${recordIds}) AND
            Attribute_Label__c IN (${linkedLabelIds})
          )`
        )
      );

      let currValue;
      let isFirstLevelVariant;
      valuesList.forEach(val => {
        newVariant = new Map();
        currValue = val;
        isFirstLevelVariant = true;
        while (true) {
          // add variant value's Product ID
          if (isFirstLevelVariant) {
            newVariant.set('Product_ID', currValue.Name);
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
          overwrittenValues.forEach(overwrittenValue => {
            let affectedLabelName;
            linkedLabels.forEach(label => {
              if (
                label.Id ===
                helper.getValue(overwrittenValue, 'Attribute_Label__c')
              ) {
                affectedLabelName = label.Name;
              }
            });
            const affectedVariantValue = helper.getValue(
              overwrittenValue,
              'Overwritten_Variant_Value__c'
            );
            const newValue = helper.getValue(overwrittenValue, 'Value__c');
            // update the newVariant object with the overwritten values
            if (val.Id === affectedVariantValue) {
              newVariant.set(affectedLabelName, newValue);
            }
          });
        }
        exportRecords.push(newVariant);
      });
    } else {
      throw 'Invalid Export Type';
    }
    if (reqBody.isInherited) {
      const filledInData = await fillInInheritedData(
        baseProduct,
        exportRecords,
        valuesList,
        exportType,
        productVariantValueMapList,
        recordIds,
        linkedLabelIds,
        linkedLabels,
        currentVariantName
      );
      exportRecordsAndCols = [filledInData];
    } else {
      exportRecordsAndCols = [exportRecords];
    }
    let templateFields;
    let templateHeaders;
    if (reqBody.options.isTemplateExport && reqBody.templateVersionData) {
      // parse headers and fields and store them in a map
      const templateRows = reqBody.templateVersionData.split(/\r?\n/);
      templateHeaders = templateRows[0].split(',');
      templateFields = templateRows[1].split(',');
      console.log('templateHeaders1: ', templateHeaders);
      console.log('templateFields1: ', templateFields);
      for (let i = 0; i < templateFields.length; i++) {
        if (templateFields[i].includes(ATTRIBUTE_FLAG)) {
          // remove PROPEL_ATT() flag temporarily to remove double quotes or consecutive double quotes
          templateFields[i] = templateFields[i].split('\"');
          console.log('templateFields[i]: ', templateFields[i]);
          templateFields[i] =
            templateFields[i][Math.floor(templateFields[i].length / 2)];
          console.log('templateFields[i]: ', templateFields[i]);
          if (templateFields[i].includes(ATTRIBUTE_FLAG)) {
            templateFields[i] = templateFields[i].slice(11, -1);
          }
          templateFields[i] = 'PROPEL_ATT(' + templateFields[i] + ')';
        }
      }
    }
    console.log('templateHeaders2: ', templateHeaders);
    console.log('templateFields2: ', templateFields);
    return await addExportColumns(
      productVariantValueMapList,
      templateFields,
      templateHeaders,
      exportRecordsAndCols
    );
  }
}

// PIM repo ProductService.getVariantAndVariantValues
async function getVariantAndVariantValues(variantValueIds, exportType) {
  let valueIds = [];
  variantValueIds.split(', ').forEach(id => {
    valueIds.push(id);
  });
  valueIds =
    exportType === 'allVariants'
      ? valueIds.map(id => `'${id}'`).join(',')
      : valueIds;
  let returnMap = new Map();
  let values = await service.simpleQuery(
    helper.namespaceQuery(
      `select
        Id,
        Name,
        Label__c,
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
      Name: helper.getValue(value, 'Variant__r').Name,
    };
    if (returnMap.has(tempVariant)) {
      returnMap.set(tempVariant, [...returnMap.get(tempVariant), value]);
    } else {
      returnMap.set(tempVariant, [value]);
    }
  });
  return returnMap;
}

async function fillInInheritedData(
  baseProduct,
  exportRecords,
  valuesList,
  exportType,
  productVariantValueMapList,
  recordIds,
  linkedLabelIds,
  linkedLabels,
  currentVariantName
) {
  if (exportType === 'currentVariant') {
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
    const variantAndValueListMap = await getVariantAndVariantValues(
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
    valuesIdList = valuesIdList.map(id => `'${id}'`).join(',');
    const overwrittenValues = await service.simpleQuery(
      helper.namespaceQuery(
        `select Id, Attribute_Label__c, Value__c, Product__c, Overwritten_Variant_Value__c
        from Attribute_Value__c
        where (
          Overwritten_Variant_Value__c IN (${valuesIdList}) AND
          Product__c IN (${recordIds}) AND
          Attribute_Label__c IN (${linkedLabelIds})
        )`
      )
    );

    let currValue;
    let isFirstLevelVariant;
    valuesList.forEach(val => {
      newVariant = new Map();
      currValue = val;
      isFirstLevelVariant = true;
      while (true) {
        // add variant value's Product ID
        if (isFirstLevelVariant) {
          newVariant.set('Product_ID', currValue.Name);
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
        overwrittenValues.forEach(overwrittenValue => {
          let affectedLabelName;
          linkedLabels.forEach(label => {
            if (
              label.Id ===
              helper.getValue(overwrittenValue, 'Attribute_Label__c')
            ) {
              affectedLabelName = label.Name;
            }
          });
          const affectedVariantValue = helper.getValue(
            overwrittenValue,
            'Overwritten_Variant_Value__c'
          );
          const newValue = helper.getValue(overwrittenValue, 'Value__c');
          // update the newVariant object with the overwritten values
          if (val.Id === affectedVariantValue) {
            newVariant.set(affectedLabelName, newValue);
          }
        });
      }
      exportRecords.push(newVariant);
    });
    exportType = 'currentVariant';
  }

  let variantValueTree = await createVariantValueTree(valuesList, baseProduct);
  filledInExportRecords = [];
  filledInExportRecords.push(exportRecords.shift());

  // loop through base product's data
  let baseProductData = new Map();
  Array.from(baseProduct.keys()).forEach(key => {
    if (baseProduct.get(key) != null && baseProduct.get(key) != '') {
      // baseProduct has value for that attribute
      baseProductData.set(key, baseProduct.get(key));
    }
  });

  // loop through baseProduct's children to settle inheritance from base product
  variantValueTree
    .get(baseProduct.get('Product_ID'))
    .forEach(firstLevelVariant => {
      exportRecords.forEach(variant => {
        if (variant.get('Product_ID') === firstLevelVariant) {
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
              currentVariantName === variant.get('Product_ID'))
          ) {
            filledInExportRecords.push(variant);
          }
        }
      });
    });

  // loop through each variant (top down) to settle inheritance from parent variants
  exportRecords.forEach(variant => {
    variantValueTree.get(variant.get('Product_ID')).forEach(childVariant => {
      exportRecords.forEach(variantValue => {
        if (variantValue.get('Product_ID') === childVariant) {
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
              currentVariantName === variantValue.get('Product_ID'))
          ) {
            filledInExportRecords.push(variantValue);
          }
        }
      });
    });
  });
  return filledInExportRecords;
}

async function createVariantValueTree(valuesList, baseProduct) {
  let variantValueTree = [];
  let treeNode;

  // add root node for baseProduct
  treeNode = new Map();
  treeNode.set('Product_ID', baseProduct.get('Product_ID'));
  treeNode.set('Id', baseProduct.get('Id'));
  treeNode.set('Children', []);
  variantValueTree.push(treeNode);

  // add nodes for variants
  valuesList.forEach(value => {
    treeNode = new Map();
    treeNode.set('Product_ID', value.Name);
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
    childMap.set(variant.get('Product_ID'), variant.get('Children'));
  });
  return childMap;
}

async function addExportColumns(
  productVariantValueMapList,
  templateFields,
  templateHeaders,
  exportRecordsAndCols
) {
  let exportColumns = [];
  let templateHeaderValueMap = new Map();
  if (!templateFields || templateFields.length === 0) {
    // if not template export, push all attribute columns
    Array.from(productVariantValueMapList[0].keys()).forEach(col => {
      if (col !== 'Id') {
        exportColumns = [
          ...exportColumns,
          { fieldName: col, label: col, type: 'text' },
        ];
      }
    });
  } else if (templateFields && templateFields.length > 0) {
    // template export
    let field;
    for (let i = 0; i < templateFields.length; i++) {
      field = templateFields[i];
      if (field.includes(ATTRIBUTE_FLAG)) {
        console.log('field includes flag: ', field);
        // template specifies that the column's rows should contain a field's value
        field = field.slice(11, -1);
        console.log('field after slice: ', field);
        Array.from(productVariantValueMapList[0].keys()).forEach(col => {
          const isMatchingColAndField =
            (field !== 'Product ID' && field === col) ||
            (col === 'Product_ID' && field === 'Product ID');
          if (col !== 'Id' && isMatchingColAndField) {
            console.log('cols pushed');
            // push columns specified in template
            exportColumns = [
              ...exportColumns,
              {
                fieldName: col,
                label: templateHeaders[i],
                type: 'text',
              },
            ];
          }
          console.log('exportColumns: ', exportColumns);
        });
      } else {
        // template specifies that the column's rows should contain the raw value in the template
        templateHeaderValueMap.set(templateHeaders[i], field);
        exportColumns = [
          ...exportColumns,
          {
            fieldName: templateHeaders[i],
            label: templateHeaders[i],
            type: 'text',
          },
        ];
      }
    }
    // populate export records with raw values specified in the template
    Array.from(templateHeaderValueMap.keys()).forEach(header => {
      exportRecordsAndCols[0].forEach(recordMap => {
        recordMap.set(header, templateHeaderValueMap.get(header));
      });
    });
  }
  return [...exportRecordsAndCols, exportColumns];
}

module.exports = PimStructure;
