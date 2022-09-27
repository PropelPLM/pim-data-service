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

describe('Import Category Test', () => {

  describe('testing /import/pim/category', () => {
    it('/import/pim/category post', (done) => {
      chai.request(server)
        .post('/import/pim/category')
        .send('{}')
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
        .send('{}')
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
          console.log(response.body)
          response.body.should.have.assert('{}', 'Failure: body was not {}')
        done()
        })
    })
  })
})
