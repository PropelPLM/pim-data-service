/* eslint-disable no-undef */
const express = require('express');
const app = express();
const bodyParser = require('body-parser');
const helmet = require('helmet');

// app Configuration
const bodySize = '80mb';
app.use(bodyParser.json({ limit: bodySize }));
app.use(bodyParser.urlencoded({ extended: false, limit: bodySize }));
app.use(helmet.frameguard());
app.use(express.static(__dirname + '/public'));
module.exports = app.listen(process.env.PORT || 5001);

/**
 * objects used in routes
 */
const ImportAssetMetadata = require('./lib/ImportAssetMetadata');
const ImportAssetLink = require('./lib/ImportAssetLink')
const ImportAttributeGroup = require('./lib/ImportAttributeGroup')
const ImportAttributeLabel = require('./lib/ImportAttributeLabel')
const ImportAttributeTab = require('./lib/ImportAttributeTab');
const ImportCategory = require('./lib/ImportCategory');
const ImportCommerceProduct = require('./lib/ImportCommerceProduct');
const ImportProduct = require('./lib/ImportProduct');
const ExportPim = require('./lib/ExportProduct');

const LegacyExportPim = require('./legacy/ExportPIM');

const ERROR_OBJ = { message: '', success: false };
const SUCCESS_OBJ = { message: 'Request received', success: true };

const printBody = (req) => {
  if (process.env.PRINT_BODY) {
    if (req.body) {
      console.log('--- request body', req.body);
    } else {
      console.log('--- body is empty');
    }
  }
}

/**
 * routes for our node app
 */
app.get('/', (req, res) => {
  res.status(200).send('Propel PIM data server is running.');
});

// Importing Routes

/**
 * route for importing commerce cloud data
 */
app.post('/import/commerce/product', (req, res) => {
  try {
    printBody(req);
    new ImportCommerceProduct(req, res);
    res.status(200).send(SUCCESS_OBJ);
  } catch(error) {
    ERROR_OBJ.message = error;
    res.status(400).send(ERROR_OBJ);
    console.error(ERROR_OBJ)
  }
});

/**
 * route for importing pim digital assets
 */
app.post('/import/pim/assetmetadata', (req, res) => {
  try {
    printBody(req);
    new ImportAssetMetadata(req, res);
    res.status(200).send(SUCCESS_OBJ);
  } catch (error) {
    ERROR_OBJ.message = error;
    res.status(400).send(ERROR_OBJ);
    console.error(ERROR_OBJ)
  }
});

/**
 * route for importing pim Digital Asset Link to Product
 */
app.post('/import/pim/assetlink', (req, res) => {
  try {
    printBody(req);
    new ImportAssetLink(req, res);
    res.status(200).send(SUCCESS_OBJ);
  } catch (error) {
    ERROR_OBJ.message = error;
    res.status(400).send(ERROR_OBJ);
    console.error(ERROR_OBJ)
  }
});

/**
 * route for importing pim Attribute Groups
 */
app.post('/import/pim/attributegroup', (req, res) => {
  try {
    printBody(req);
    new ImportAttributeGroup(req, res);
    res.status(200).send(SUCCESS_OBJ);
  } catch (error) {
    ERROR_OBJ.message = error;
    res.status(400).send(ERROR_OBJ);
    console.error(ERROR_OBJ)
  }
});

/**
 * route for importing pim Attribute Labels
 */
app.post('/import/pim/attributelabel', (req, res) => {
  try {
    printBody(req);
    new ImportAttributeLabel(req, res);
    res.status(200).send(SUCCESS_OBJ);
  } catch (error) {
    ERROR_OBJ.message = error;
    res.status(400).send(ERROR_OBJ);
    console.error(ERROR_OBJ)
  }
});

/**
 * route for importing pim Attribute Tabs
 */
app.post('/import/pim/attributetab', (req, res) => {
  try {
    printBody(req);
    new ImportAttributeTab(req, res);
    res.status(200).send(SUCCESS_OBJ);
  } catch (error) {
    ERROR_OBJ.message = error;
    res.status(400).send(ERROR_OBJ);
    console.error(ERROR_OBJ)
  }
});

/**
 * route for importing pim categories
 */
app.post('/import/pim/category', (req, res) => {
  try {
    printBody(req);
    new ImportCategory(req, res);
    res.status(200).send(SUCCESS_OBJ);
  } catch (error) {
    ERROR_OBJ.message = error;
    res.status(400).send(ERROR_OBJ);
    console.error(ERROR_OBJ)
  }
});

/**
 * route for importing pim products
 */
app.post('/import/pim/product', (req, res) => {
  try {
    printBody(req);
    new ImportProduct(req, res);
    res.status(200).send(SUCCESS_OBJ);
  } catch (error) {
    ERROR_OBJ.message = error;
    res.status(400).send(ERROR_OBJ);
    console.error(ERROR_OBJ)
  }
});

// Export Routes

/**
 * route for exporting pim products
 */
app.post('/export/pim/product', (req, res) => {
  try {
    printBody(req);
    new ExportPim(req);
    res.status(200).send(SUCCESS_OBJ);
  } catch (error) {
    ERROR_OBJ.message = error;
    res.status(400).send(ERROR_OBJ);
    console.error(ERROR_OBJ)
  }
});

/**
 * route for legacy exporter
 */
app.post('/export/legacy/pim/product', async (req, res) => {
  try {
    printBody(req);
    const result = await LegacyExportPim(req);
    console.log('result: ', JSON.parse(JSON.stringify(result)));
    res.status(200).send(JSON.parse(JSON.stringify(result)));
  } catch (err) {
    res.status(400).send('');
  }
});
