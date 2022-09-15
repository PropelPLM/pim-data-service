const LegacyExportProduct = require('../legacy/ExportPIM')

const treq = {
  body: {
    sessionId:
      '00D8c0000086640!AQkAQJklfqn0y0vCAfxvvalymHKjIKIxkA8PhFcSY_RuRapuI4giTIsIw_WF8ksItsUJ2A_PPmS0LgrOp8wfxhtRKhi7cGfF',
    namespace: '',
    instanceUrl: 'https://pim-qa.my.salesforce.com',
    hostUrl: 'pim-qa.my.salesforce.com',
    variantValuePath: null,
    variantValueIds: [
      'a098c00000t7IQeAAM',
      'a098c00000t7IQtAAM',
      'a098c00000t7IQYAA2',
      'a098c00000t7IQaAAM',
    ],
    templateVersionData: null,
    recordIds: [
      // 'a068c00000o5C4NAAU',
      // 'a068c00000o5C4OAAU',
      // 'a068c00000o5C4PAAU',
      // 'a068c00000o5C4QAAU',
      // 'a068c00000o5C4RAAU',
      'a068c00000o5C4nAAE',
    ],
    options: { isTemplateExport: false, isListPageExport: true },
    linkedLabels: [],
    linkedGroups: [],
    linkedGroupIds: null,
    isPrimaryCategory: null,
    isInherited: null,
    exportType: null,
    excludedLabelIds: null,
    categoryId: 'a058c00000e9RkDAAU',
  }
}

LegacyExportProduct(treq)
