const fs = require('fs')
const ImportProduct = require('../lib/ImportProduct');
// replace with your test org metadata
const hostUrl = "pim-uat.my.salesforce.com"
const namespace = "PIM"
const orgId = "00D8c00000868mL"
const sessionId = "00D8c00000868mL!AR0AQPCnxBX27z2PLFtfRhddeAPKZdl7wkPv3q0bF.zPufapVb2uUGVbhWQH.6a0otHhlzhMcbiOldFZuWZtbEDmSXfAmfot"

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
