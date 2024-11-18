const { logErrorResponse, logSuccessResponse } = require('./utils');
let helper;
let service;

async function PimRecordManager(
  recordIds,
  pHelper,
  pService,
  isProduct = true
) {
  helper = pHelper;
  service = pService;
  return await buildWithRecordIds(recordIds, isProduct);
}

async function buildWithRecordIds(recordIds, isProduct) {
  // ProductManager.buildWithProductIds
  try {
    const records = await service.queryExtend(
      helper.namespaceQuery(
        `select Id, Name, Category__c, Category__r.Name, ${
          isProduct ? '' : 'CreatedDate, Asset_Status__c, External_File_Id__c, Mime_Type__c, Size__c, View_Link__c,'
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
          ? `, (
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
      where Id IN (${service.QUERY_LIST})`.replace(/\n/g, ' ')
      ),
      recordIds.split(',')
    );
    logSuccessResponse(
      `Records retrieved: ${records?.length}`,
      '[PimRecordManager.buildWithRecordIds]'
    );
    return records;
  } catch (err) {
    logErrorResponse(err, '[PimRecordManager.buildWithRecordIds]');
  }
}

module.exports = PimRecordManager;
