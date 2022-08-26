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
 * static
 */
app.get('/', (req, res) => {
  const logging = propelConnect.newConnection('test', 'test')
  res.send('Propel PIM data server is running. AND connection is ' + logging.QUERY_LIST)
})
