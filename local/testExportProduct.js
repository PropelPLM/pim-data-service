const ExportProduct = require('../lib/ExportProduct')

const treq = {
  body: {
    sessionId:
      '00D8c0000086640!AQkAQHu0LafnNFDfkVRbOFTqcMPA2RDIrb2d7.kI5HZpHbf6F9tIhaj9NTMaQjwuNNA6czl5.tXE_V4ahGCVylHEL8SclByg',
    namespace: '',
    instanceUrl: 'https://pim-qa.my.salesforce.com',
    hostUrl: 'pim-qa.my.salesforce.com',
    variantValuePath: null,
    variantValueIds: [
      'a098c00000rbJJAAA2',
      'a098c00000rbJJHAA2',
      'a098c00000rbJJGAA2',
      'a098c00000rbJJFAA2',
      'a098c00000rbJJBAA2',
      'a098c00000rbJJLAA2',
      'a098c00000rbJJKAA2',
      'a098c00000rbJJJAA2',
      'a098c00000rbJJMAA2',
      'a098c00000rbJJIAA2',
      'a098c00000rbJJ9AAM',
      'a098c00000rbJJEAA2',
      'a098c00000rbJJDAA2',
      'a098c00000rbJJCAA2',
      'a098c00000slMfVAAU',
      'a098c00000slMfWAAU',
      'a098c00000skK22AAE',
    ],
    templateVersionData: null,
    recordIds: [
      // 'a068c00000o5C4NAAU',
      // 'a068c00000o5C4OAAU',
      // 'a068c00000o5C4PAAU',
      // 'a068c00000o5C4QAAU',
      // 'a068c00000o5C4RAAU',
      'a068c00000o5C4SAAU',
    ],
    options: { isTemplateExport: false, isListPageExport: true },
    linkedLabels: [],
    linkedGroups: [],
    linkedGroupIds: null,
    isPrimaryCategory: null,
    isInherited: null,
    exportType: null,
    excludedLabelIds: null,
    categoryId: 'a058c00000dK6qLAAS',
  }
}

const tres = {
  send: r => { console.log(r) }
}

new ExportProduct(treq, tres)
