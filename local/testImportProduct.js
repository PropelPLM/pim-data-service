const fs = require('fs')
const ImportProduct = require('../lib/ImportProduct');
// replace with your test org metadata
const hostUrl = "pim-qa.my.salesforce.com"
const namespace = ""
const orgId = "00D8c0000086640"
const sessionId = "00D8c0000086640!AQkAQKpHoLk0c6rTetakSvDd1XP4itZg5Jj4jd_y.HsTs414xTVKkiXjHG2hggWsmAIGcKfPgm4DZbvvPRLjvE3ks2j2lM56"

function productTest() {
  let treq = {
    body: {
      "skipDB": true,
      "namespace": namespace,
      "hostUrl": hostUrl,
      "orgId": orgId,
      "sessionId": sessionId,
      "batchsize": 3,
      "mapping": {},
      "data": fs.readFileSync('./data/product_data.csv'),
      "options": {},
    }
  }

  let tres = {
    send: (r)=>{ console.log(r); }
  }

  new ImportProduct(treq, tres)
}

productTest()
