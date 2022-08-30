const fs = require('fs')
const ImportPimCategory = require('../lib/ImportCategory');
// replace with your test org metadata
const hostUrl = "pim-qa.my.salesforce.com"
const namespace = ""
const orgId = "00D8c0000086640"
const sessionId = "00D8c0000086640!AQkAQE92Ql6U.xnPyzeOtwHYmj2m.zu6AKEcq_pU7MxyEUv7tbL3dWCVp.F1TWPpgQkc2z191OuQhVKhy_MHS.A25vnGHs0s"

function categoryTest() {
  let treq = {
    body: {
      "skipDB": true,
      "namespace": namespace,
      "hostUrl": hostUrl,
      "orgId": orgId,
      "sessionId": sessionId,
      "batchsize": 3,
      "mapping": {},
      "data": fs.readFileSync('./data/category_data.csv'),
      "options": {},
    }
  }

  let tres = {
    send: (r)=>{ console.log(r); }
  }

  new ImportPimCategory(treq, tres)
}

categoryTest()
