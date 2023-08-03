const { prepareIdsForSOQL } = require('../legacy/utils');
const HISTORY_ACTIONS = Object.freeze({
    RECORD_CREATION: 'RECORD_CREATION',
    ATTRIBUTE_CREATION: 'ATTRIBUTE_CREATION'
  }),
  ATTRIBUTE_VALUE_TYPE = 'attribute_value__c',
  PRODUCT_TYPE = 'product__c',
  VARIANT_VALUE_TYPE = 'variant_value__c',
  TRACKED_TYPES = new Set([
    ATTRIBUTE_VALUE_TYPE,
    PRODUCT_TYPE,
    VARIANT_VALUE_TYPE
  ]);

class HistoryService {
  constructor({
    log,
    connection,
    helper,
    importFileLink,
    importFileName,
    userId,
    userName
  }) {
    Object.assign(this, {
      log,
      connection,
      helper,
      importFileLink,
      importFileName,
      userId,
      userName
    });
  }

  insertHistories = async () => {
    const successfulDMLLogs = this.log?.logs?.filter(res => res.success);
    const queryPromises = this.setupHistoryMetadata(successfulDMLLogs);
    const historyEntries = await this.createHistories(queryPromises);
    this.logHistories(historyEntries);
  };

  setupHistoryMetadata = (successfulDMLLogs) => {
    const queryPromises = [];
    Object.entries(this.splitByRecordType(successfulDMLLogs))
    .forEach(([sobjName, recordIds]) => {
      queryPromises.push(
        this.connection.simpleQuery(
          this.helper.namespaceQuery(
            this.getAdditionalInfoQuery(sobjName, recordIds)
          )
        )
      );
    });
    return queryPromises;
  }

  createHistories = async (queryPromises) => {
    const histories = [],
      createdDateTime = new Date().toISOString();
    let type;
    (await Promise.all(queryPromises))
    .forEach(result =>
      result.records.forEach(record => {
        type = record.attributes.type.toLowerCase();
        if (!TRACKED_TYPES.has(type)) return;
        histories.push(this.generateHistory(record, type, createdDateTime));
      })
    );
    return histories;
  }

  logHistories = async (historyEntries) => {
    const generatedSObjs = historyEntries.map(hist => {
      return {
        [this.helper.namespace('ClassName__c')]: hist.recordId,
        [this.helper.namespace('ResponseBody__c')]: hist.finalise()
      }
    })
    await this.connection.insertSlice(this.helper.namespace('Log__c'), generatedSObjs, 1000);
  }

  splitByRecordType = successfulDMLLogs => {
    const returnMap = {};
    successfulDMLLogs?.forEach(({ record_id, sobject_name }) => {
      if (!Object.hasOwnProperty.call(returnMap, sobject_name)) {
        returnMap[sobject_name] = [];
      }
      returnMap[sobject_name].push(record_id);
    });
    return returnMap;
  };

  getAdditionalInfoQuery = (sobjName, recordIds) => {
    const recordIdsForQuery = prepareIdsForSOQL(recordIds);
    let fields;
    switch (sobjName.toLowerCase()) {
      case 'variant_value__c':
        fields =
          'Id, Name, Label__c, Variant__c, Variant__r.Name, Variant__r.Order__c, Variant__r.Product__c';
        break;
      case ATTRIBUTE_VALUE_TYPE:
        fields =
          'Id, Name, Overwritten_Variant_Value__c, Value__c, Attribute_Label__c, Attribute_Label__r.Name';
      default:
        fields = 'Id, Name';
    }
    return `SELECT ${fields} FROM ${sobjName} WHERE ID IN (${recordIdsForQuery})`;
  };

  generateHistory = (record, type, createdDateTime) => {
    return new HistoryBuilder({
      record,
      type,
      createdDateTime,
      helper: this.helper,
      userId: this.userId,
      userName: this.userName,
      importFileLink: this.importFileLink,
      importFileName: this.importFileName
    })
      .setAction()
      .setRelatedRecordIds()
      .setChangedField()
      .setChangedFieldId()
      .setNewValue();
  };
}

class HistoryBuilder {
  constructor({
    helper,
    record,
    type,
    createdDateTime,
    userId,
    userName,
    importFileLink,
    importFileName
  }) {
    // monkey patch
    helper.getValue = function (object, fieldApi) {
      if (!object || !fieldApi) {
        return null
      }
      let fields = fieldApi.split('.');
      let queryResult = object;
      fields.forEach(field => {
        if (queryResult) {
          if (field.endsWith('__c') || field.endsWith('__r')) {
            queryResult = queryResult[helper.namespace(field)];
          } else {
            queryResult = queryResult[field];
          }
        }
      });
      return queryResult;
    }
    Object.assign(this, {
      helper,
      record,
      type,
      createdDateTime,
      userId,
      userName,
      importFileLink,
      importFileName
    });
  }

  resolveAction = () =>
    this.type == ATTRIBUTE_VALUE_TYPE
      ? HISTORY_ACTIONS.ATTRIBUTE_CREATION
      : HISTORY_ACTIONS.RECORD_CREATION;

  resolveRelatedRecordIds = () => {
    if (this.type == ATTRIBUTE_VALUE_TYPE) {
      return [
        this.helper.getValue(this.record, 'Product__c'),
        this.helper.getValue(this.record, 'Overwritten_Variant_Value__c'),
        this.helper.getValue(this.record, 'Digital_Asset__c')
      ];
    }

    if (this.type == PRODUCT_TYPE) {
      return [this.helper.getValue(this.record, 'Id')];
    }

    return [
      this.helper.getValue(this.record, 'Variant__r.Product__c'),
      this.helper.getValue(this.record, 'Id')
    ];
  };

  resolveChangedField = () => {
    if (this.type == VARIANT_VALUE_TYPE) {
      return this.helper.getValue(this.record, 'Variant__r.Name');
    } else if (this.type == PRODUCT_TYPE) {
      return this.helper.getValue(this.record, 'Name');
    }
    return this.helper.getValue(this.record, 'Attribute_Label__r.Name');
  };

  resolveChangedFieldId = () => {
    if (this.type == ATTRIBUTE_VALUE_TYPE) {
      return this.helper.getValue(this.record, 'Attribute_Label__c');
    }
    return this.helper.getValue(this.record, 'Id');
  };

  resolveNewValue = () => {
    if (this.type == ATTRIBUTE_VALUE_TYPE) {
      return this.helper.getValue(this.record, 'Value__c');
    }
    return this.helper.getValue(this.record, 'Name');
  };

  setAction = () => {
    const action = this.resolveAction();
    if (!Object.hasOwnProperty.call(HISTORY_ACTIONS, action)) return this;
    this.action = action;
    return this;
  }

  setRelatedRecordIds = () => {
    const [prodId, varValId, daId] = this.resolveRelatedRecordIds();
    if (daId) {
      this.recordId = daId;
    } else {
      this.recordId = prodId;
      this.variantValueId = varValId;
    }
    return this;
  }

  setChangedField = () => {
    const changedField = this.resolveChangedField();
    this.changedField = changedField;
    return this;
  }

  setChangedFieldId = () => {
    const changedFieldId = this.resolveChangedFieldId();
    this.changedFieldId = changedFieldId;
    return this;
  }

  setImportFileLink(importFileLink) {
    this.importFileLink = importFileLink;
    this.isImport = true;
    return this;
  }

  setNewValue = () => {
    const newValue = this.resolveNewValue()
    this.newValue = newValue;
    return this;
  }

  finalise = () => {
    this.entryKey = this.createdDateTime + this.userId;
    return JSON.stringify({
      variantValueId: this.variantValueId,
      userName: this.userName,
      userId: this.userId,
      relatedTaskId: null,
      recordId: this.recordId,
      oldValue: null,
      newValue: this.newValue,
      isImport: true,
      importFileName: this.importFileName,
      importFileLink: this.importFileLink,
      entryKey: this.entryKey,
      createdDateTime: this.createdDateTime,
      changedFieldId: this.changedFieldId,
      changedField: this.changedField,
      action: this.action
    });
  }
}

module.exports = HistoryService;
