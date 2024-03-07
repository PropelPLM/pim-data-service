const assert = require('assert')
const chai = require('chai')
const chaiHTTP = require('chai-http')

const server = require('../index')

// chai setup
chai.should()
chai.use(chaiHTTP)

describe('Index Tests', () => {

  describe('testing root', () => {
    it('root get', (done) => {
      chai.request(server)
        .get('/')
        .end((err, response) => {
          response.should.have.status(200)
        done()
        })
    })
  })
})

describe('Import Commerce Cloud Product Route', () => {

  describe('testing /import/commerce/product', () => {
    it('/import/commerce/product post', (done) => {
      chai.request(server)
        .post('/import/commerce/product')
        .send(
          {
            body: {
              data: 'bmFtZSxhdHRyaWJ1dGVfdGFiLGNsYXNzaWZpY2F0aW9uLHJhbmssY2F0ZWdvcnlfYXNzb2NpYXRpb25zCkdyb3VwIEEsVGFiIEEsUHJvZHVjdCw1LDEyMDIyCkdyb3VwIEIsVGFiIEIsUHJvZHVjdCw2LDEyMDMzOzExMDIx',
              dataType: 'csv',
              mappingId: 'test'
            }
          },
          {}
        )
        .end((err, response) => {
          response.body.should.have.property('success')
        done()
        })
    })
  })
})

describe('Import Asset Link Test', () => {

  describe('testing /import/pim/assetlink', () => {
    it('/import/pim/assetlink post', (done) => {
      chai.request(server)
        .post('/import/pim/assetlink')
        .send({body:{data: ''}})
        .end((err, response) => {
          response.body.should.have.property('success')
        done()
        })
    })
  })
})

describe('Import Attribute Test', () => {

  describe('testing /import/pim/attributelabel', () => {
    it('/import/pim/attributelabel post', (done) => {
      chai.request(server)
        .post('/import/pim/attributelabel')
        .send({body:{data: ''}})
        .end((err, response) => {
          response.body.should.have.property('success')
        done()
        })
    })
  })
})

describe('Import Attribute Group Test', () => {

  describe('testing /import/pim/attributegroup', () => {
    it('/import/pim/attributegroup post', (done) => {
      chai.request(server)
        .post('/import/pim/attributegroup')
        .send({body:{data: ''}})
        .end((err, response) => {
          response.body.should.have.property('success')
        done()
        })
    })
  })
})

describe('Import Attribute Tab Test', () => {

  describe('testing /import/pim/attributetab', () => {
    it('/import/pim/attributetab post', (done) => {
      chai.request(server)
        .post('/import/pim/attributetab')
        .send({body:{data: ''}})
        .end((err, response) => {
          response.body.should.have.property('success')
        done()
        })
    })
  })
})

describe('Import Category Test', () => {

  describe('testing /import/pim/category', () => {
    it('/import/pim/category post', (done) => {
      chai.request(server)
        .post('/import/pim/category')
        .send({body:{data: ''}})
        .end((err, response) => {
          response.body.should.have.property('success')
        done()
        })
    })
  })
})

describe('Import Product Test', () => {

  describe('testing /import/pim/product', () => {
    it('/import/pim/product post', (done) => {
      chai.request(server)
        .post('/import/pim/product')
        .send({body:{data: ''}})
        .end((err, response) => {
          response.body.should.have.property('success')
        done()
        })
    })
  })
})

describe('Export Product Test', () => {

  describe('testing /export/pim/product', () => {
    it('/export/pim/product post', (done) => {
      chai.request(server)
        .post('/export/pim/product')
        .send('{}')
        .end((err, response) => {
          response.body.should.have.property('success')
        done()
        })
    })
  })
})

describe('Export Legacy Product Test', () => {

  describe('testing /export/legacy/pim/product', () => {
    it('/export/legacy/pim/category post', (done) => {
      chai.request(server)
        .post('/export/legacy/pim/product')
        .send('{}')
        .end((err, response) => {
          response.body.should.have.assert('{}', 'Failure: body was not {}')
        done()
        })
    })
  })
})
