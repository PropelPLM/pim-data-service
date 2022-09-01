/* eslint-disable no-undef */
const express = require('express');
const app = express()
const bodyParser = require('body-parser');
const helmet = require('helmet');
const propelConnect = require('@propelsoftwaresolutions/propel-sfdc-connect');

// app Configuration
const bodySize = '80mb'
app.use(bodyParser.json({ limit: bodySize }))
app.use(bodyParser.urlencoded({ extended: false, limit: bodySize }))
app.use(helmet.frameguard());
app.listen((process.env.PORT || 5001))

/**
 * objects used in routes
 */
const ImportCategory = require('./lib/ImportCategory');
const ImportProduct = require('./lib/ImportProduct')

/**
 * routes for our node app
 */
app.get('/', (req, res) => {
  const logging = propelConnect.newConnection('test', 'test')
  res.send('Propel PIM data server is running. AND connection is ' + logging.QUERY_LIST)
})

/**
 * route for importing pim categories
 */
app.post('/import/pim/category', (req, res) => {
  try {
    new ImportCategory(req, res)
    res.status(200)
    res.send({ message: 'Request received', success: true })
  } catch(error) {
    res.status(400)
    res.send({ message: `Error: ${error}`, success: false })
  }

  /**
 * route for importing pim products
 */
app.post('/import/pim/product', (req, res) => {
  try {
    new ImportProduct(req, res)
    res.status(200)
    res.send({ message: 'Request received', success: true })
  } catch(error) {
    res.status(400)
    res.send({ message: `Error: ${error}`, success: false })
  }
})
