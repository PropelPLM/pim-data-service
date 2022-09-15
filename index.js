/* eslint-disable no-undef */
const express = require('express');
const app = express()
const bodyParser = require('body-parser');
const helmet = require('helmet');

// app Configuration
const bodySize = '80mb'
app.use(bodyParser.json({ limit: bodySize }))
app.use(bodyParser.urlencoded({ extended: false, limit: bodySize }))
app.use(helmet.frameguard());
app.listen((process.env.PORT || 5001))

/**
 * objects used in routes
 */
const ImportCategory = require('./lib/ImportCategory')
const ImportProduct = require('./lib/ImportProduct')
const ExportPim = require('./lib/ExportProduct.js');

const ERROR_OBJ = { message: '', success: false }
const SUCCESS_OBJ = { message: 'Request received', success: true }

/**
 * routes for our node app
 */
app.get('/', (req, res) => {
  res.status(200).send('Propel PIM data server is running.')
})

/**
 * route for importing pim categories
 */
app.post('/import/pim/category', (req, res) => {
  try {
    new ImportCategory(req, res)
    res.status(200).send(SUCCESS_OBJ)
  } catch(error) {
    ERROR_OBJ.message = error
    res.status(400).send(ERROR_OBJ)
  }
})

  /**
 * route for importing pim products
 */
app.post('/import/pim/product', (req, res) => {
  try {
    new ImportProduct(req, res)
    res.status(200).send(SUCCESS_OBJ)
  } catch(error) {
    ERROR_OBJ.message = error
    res.status(400).send(ERROR_OBJ)
  }
})

/**
 * 
 */
app.post('/export/pim', (req, res) => {
  try {
    new ExportPim(req);
    res.status(200).send(SUCCESS_OBJ);
  } catch (error) {
    ERROR_OBJ.message = error
    res.status(400).send(ERROR_OBJ);
  }
});

