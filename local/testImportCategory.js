const fs = require('fs')
const ImportCategory = require('../lib/ImportCategory');
// replace with your test org metadata
const hostUrl = "pim-qa.my.salesforce.com"
const namespace = ""
const orgId = "00D8c0000086640"
const sessionId = "00D8c0000086640!AQkAQLZoo3eL5Ga5a9.5wg5slRt16yadHJvvt1VkseKJOdJJp6AGF0hhonmPxwLihL32QuaXAM72oqjPUmCcFlhMssC.fe3F"

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

  new ImportCategory(treq, tres)
}

categoryTest()
