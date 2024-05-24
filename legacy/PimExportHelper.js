class PimExportHelper {
  constructor(namespace) {
    this.namespaceString = namespace;
  }

  /**
   * to inject name space
   * @param {string} field
   * @return {string}
   */
  namespace(field) {
    return this.namespaceString ? `${this.namespaceString}${field}` : field;
  }

  /**
   * @param {string} queryStr
   * @return {string}
   */
  namespaceQuery(queryStr) {
    let parts = queryStr.split(/[ ,.\n]/g);
    parts.forEach(p => {
      if (p.endsWith('__c') || p.endsWith('__r') || p.endsWith('__mdt')) {
        queryStr = queryStr.replace(
          new RegExp(`[ ]${p}`),
          ' ' + this.namespace(p)
        );
        queryStr = queryStr.replace(
          new RegExp(`[,]${p}`),
          ',' + this.namespace(p)
        );
        queryStr = queryStr.replace(
          new RegExp(`[.]${p}`),
          '.' + this.namespace(p)
        );
      }
    });
    return queryStr;
  }

  /**
   * gets field data from object with namespace
   * @param {Object} object
   * @param {string} fieldApi
   */
  getValue(object, fieldApi) {
    if (!object || !fieldApi) {
      return null
    }
    let fields = fieldApi.split('.');
    let queryResult = object;
    fields.forEach(field => {
      if (queryResult) {
        if (field.endsWith('__c') || field.endsWith('__r')) {
          queryResult = queryResult[this.namespace(field)];
        } else {
          queryResult = queryResult[field];
        }
      }
    });
    console.log('fieldApi === Numeric_Value__c: ', fieldApi === 'Numeric_Value__c');
    console.log('fieldApi: ', fieldApi);
    console.log('queryResult: ', queryResult);
    console.log('parseInt(queryResult, 10): ', parseInt(queryResult, 10));
    return fieldApi === 'Numeric_Value__c' ? parseInt(queryResult, 10) : queryResult;
  }

  /**
   * gets appropriate value from Attribute_Value__c with namespace
   * @param {Object} attribute
   * @return {Object}
   */
  getAttributeValueValue(attribute) {
    let valueField = 'Value__c';
    if (this.getValue(attribute, 'Value_Long__c')) {
      valueField = 'Value_Long__c';
    } else if (this.getValue(attribute, 'Numeric_Value__c')) {
      valueField = 'Numeric_Value__c';
    }
    return this.getValue(attribute, valueField);
  }
}

module.exports = PimExportHelper;
