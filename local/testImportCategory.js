const fs = require('fs')
const ImportPimCategory = require('../lib/ImportCategory');
// replace with your test org metadata
const hostUrl = "pim-qa.my.salesforce.com"
const namespace = ""
const orgId = "00D8c0000086640"
const sessionId = "00D8c0000086640!AQkAQBXVJgh_0uclnfxTAQ4UZpawx9QIr_vzxALTzzI4lqCFSAb.p8.KfbKOeEIn166RwHfDPLBOh3TNxgd0Gc63Lcx1PG9J"

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
