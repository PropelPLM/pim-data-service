import * as dotenv from 'dotenv';
dotenv.config();

import {LegacyExportPIM} from '../legacy/ExportPIM.js'

const treq = {
  body: {
    isTest: true,
    user: 'test-lwa0dgwoissf@example.com',
    namespace: 'PIM__',
    instanceUrl: 'https://velocity-momentum-7312-dev-ed.scratch.my.salesforce.com',
    hostUrl: 'velocity-momentum-7312-dev-ed.scratch.my.salesforce.com',
    variantValuePath: null,
    variantValueIds: [
      'a0L7e00000VuqnPEAR',
      'a0L7e00000VuqnMEAR',
      'a0L7e00000VuqnQEAR',
    ],
    templateVersionData: null,
    recordIds: [
      // 'a068c00000o5C4NAAU',
      // 'a068c00000o5C4OAAU',
      // 'a068c00000o5C4PAAU',
      // 'a068c00000o5C4QAAU',
      // 'a068c00000o5C4RAAU',
      'a0G7e00000bv1ZWEAY',
    ],
    options: { isTemplateExport: false, isListPageExport: true },
    linkedLabels: [],
    linkedGroups: [],
    linkedGroupIds: null,
    isPrimaryCategory: null,
    isInherited: null,
    exportType: null,
    excludedLabelIds: null,
    categoryId: 'a097e00000O0xeiAAB',
  }
}

LegacyExportPIM(treq, 'testFilename', 'daTestFilename')
