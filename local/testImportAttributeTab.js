const fs = require('fs')
const ImportAttributeTab = require('../lib/ImportAttributeTab');
// replace with your test org metadata
const hostUrl = "computing-connect-3544-dev-ed.scratch.my.salesforce.com"
const namespace = "PIM"
const orgId = "00D7i000000UO0T"
const sessionId = "00D7i000000UO0T!AR0AQLF8QvuYsXpy.RkrdzH9GqmOHsIDpokbZxPoeF7nDpkP1hgCYK0XlcTE.AygBzvS00E2kXJuQv4IPj7LWmKrwgHOz28J"

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
      "data": fs.readFileSync('./data/attribute_tab_data.csv'),
      "options": {},
    }
  }

  let tres = {
    send: (r)=>{ console.log(r); }
  }

  new ImportAttributeTab(treq, tres)
}

productTest()
