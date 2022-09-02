const fs = require('fs')
const ImportProduct = require('../lib/ImportProduct');
// replace with your test org metadata
const hostUrl = "pim-qa.my.salesforce.com"
const namespace = ""
const orgId = "00D8c0000086640"
const sessionId = "00D8c0000086640!AQkAQMuoPTArYaA_YSbOc82n8wsx8R2nynbW5guP5vu1pz2hzBlzujx1MVC5TXwXBEAdSC7xrikgXdrey3v1orQUDc1JaPVt"

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
