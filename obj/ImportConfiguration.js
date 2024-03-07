/**
 * this object is used to create the payload for the b2b or b2c commerce cloud
 * product import
 *
  {
    "importConfiguration":{
      "importSource":{
        "contentVersionId":"069RM0000008F4FYAU"
      },
      "importSettings":{
        "category":{
          "productCatalogId":"0ZSRM00000004Fk4AI"
        },
        "media":{
          "cmsWorkspaceId":"0ZuRM0000000Fcz0AE"
        },
        "price":{
          "pricebookAliasToIdMapping":{
            "original":"01sRM000004aArJYAU",
            "sales":"01sRM000004aArIYAU",
            "wintersales":"01sRM000004aArKYAU"
          }
        },
        "entitlement":{
          "defaultEntitlementPolicyId":"1CeRM00000003o40AA"
        }
      }
    }
  }
 */

//"importConfiguration": {"importSource":{"contentVersionId":"068DS000002Er59YAC"},"importSettings":{"category":{"productCatalogId":"0ZSDS0000008zru4AA"},"media":{"cmsWorkspaceId":"0ZuDS00000098Y30AI"},"price":{"pricebookAliasToIdMapping":{"standard":"01sDS000009b1FSYAY"}},"entitlement":{"defaultEntitlementPolicyId":"1CeDS0000000bXa0AI"}}}}

/**
 * @param {String} contentVersionId
 * @param {String} productCatalogId
 * @param {String} cmsWorkspaceId
 * @param {Object} pricebookIds
 * @param {String} defaultEntitlementPolicyId
 */
class ImportConfiguration {
  constructor(
    contentVersionId,
    productCatalogId,
    cmsWorkspaceId,
    pricebookIds,
    defaultEntitlementPolicyId
  ) {

    this.importConfiguration = {
      importSource: {
        contentVersionId: contentVersionId
      },
      importSettings: {
        category: {
          productCatalogId: productCatalogId
        },
        media: {
          cmsWorkspaceId: cmsWorkspaceId
        },
        price: {
          pricebookAliasToIdMapping: pricebookIds
        },
        entitlement: {
          defaultEntitlementPolicyId: defaultEntitlementPolicyId
        }
      }
    }
  }
}

module.exports = ImportConfiguration
