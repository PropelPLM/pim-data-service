let helper;
let service;

async function PimProductManager(recordIds, pHelper, pService) {
  helper = pHelper
  service = pService
  return await buildWithProductIds(recordIds);
}

async function buildWithProductIds(recordIds) {
  // ProductManager.buildWithProductIds
  const productsList = await service.queryExtend(helper.namespaceQuery(
    `select Id, Name, Category__c, Category__r.Name, Title__c,
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
      where Id IN (${service.QUERY_LIST})`.replace(/\n/g, ' ')
  ), recordIds.split(','));
  return productsList;
}

module.exports = PimProductManager;
