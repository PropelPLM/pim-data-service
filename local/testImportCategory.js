const fs = require('fs')
const ImportCategory = require('../lib/ImportCategory');

const namespace = "PIM"
const orgId = "00D8c0000086640"
const clientId = "3MVG9p1Q1BCe9GmDW5YDKl_5Udkb5kyGZrff0TV7qUlPpAAGA3Ii27bZmeHFMjhmO7p0_3eM9AIhw02yCKQw7"
const username = "mike.fullmore@propelpim.dev"

function categoryTest() {
  let treq = {
    body: {
      "clientId": clientId,
      "user": username,
      "isTest": false,
      "skipDB": true,
      "namespace": namespace,
      "orgId": orgId,
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
