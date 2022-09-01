const fs = require('fs')
const ImportProduct = require('../lib/ImportProduct');
// replace with your test org metadata
const hostUrl = "pim-qa.my.salesforce.com"
const namespace = ""
const orgId = "00D8c0000086640"
const sessionId = "00D8c0000086640!AQkAQNoiRza8Z_FkA6NhT6KEe65mebIWz5.QI2h_E3iUoAOJjs.1Eeks0sbUtPtTq.ZW5uu6ye6SIg8AErwGPDQ9MR6xChDU"

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
