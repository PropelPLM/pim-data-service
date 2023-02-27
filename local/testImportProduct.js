const fs = require('fs')
const ImportProduct = require('../lib/ImportProduct');
// replace with your test org metadata
const hostUrl = "paas-espresso-3568-dev-ed.scratch.my.salesforce.com"
const namespace = ""
const orgId = "00D8c00000868mL"
const sessionId = "00DDP000005yxZa!ARIAQE8Ty0cwFI51CqiK2VEoT7vBL2e5LO.ZTtcqcczwoBmgXIfS5SRZhuKgVfUWKQNgMQA_m_WrX.Z..yTKopbjUwug1Ipz"

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
