const jsforce = require('jsforce-propel')
const https = require('https')

/**
 * a service as a database layer
 */
class ForceService {
  /**
   * @param {stirng} hostUrl
   * @param {string} sessionId
   */
  constructor(hostUrl, sessionId) {
    this.QUERY_LIST = 'QUERY_LIST_STRING'
    this.querySize = 200
    this.sessionId = sessionId
    this.serverUrl = hostUrl
    if (this.serverUrl.endsWith('visual.force.com')) {
      let dms = this.serverUrl.split('.')
      this.serverUrl = dms[1] + '.salesforce.com'
    }
    this.conn = this.connectSF()
    this.conn.bulk.pollInterval = 2 * 1000 // 2 sec
    this.conn.bulk.pollTimeout = 180 * 1000 // 180 sec
  }

  /**
   * @return {Connection} jsforce object
   */
  connectSF() {
    return new jsforce.Connection({
      serverUrl: 'https://' + this.serverUrl,
      sessionId: this.sessionId,
      maxRequest: 500,
    })
  }

  /**
   * @param {Error} err
   * @param {Object[]} result
   * @returns {Object[]}
   */
  _sReturn(err, result) {
    if (err) { return console.error(err) }
    return result
  }

  _sMapId(objects, results) {
    for (let i = 0; i < results.length; i++) {
      objects.Id = results[i].id
    }
  }

  /**
   * note: avoid 414: URI Too Long with more than 16,410 characters
   * @param {string} queryString
   * @return {Promise}
   */
  simpleQuery(queryString) {
    return new Promise(async (resolve, reject) => {
      let records = []
      try {
        let result = await this.conn.query(queryString)
        records = records.concat(result.records);
        while (result.done === false) {
          result = await this.conn.queryMore(result.nextRecordsUrl);
          records = records.concat(result.records);
        }
        resolve(records)
      } catch (e) {
        reject(e)
      }
    })
  }

  /**
   * Standard bulk query, limitation applied
   * note: no sub-query in bulk query
   * note: return cannot exceed 20,000 characters
   * @param {string} queryString
   * @return {Promise}
   */
  queryLimit(queryString) {
    return new Promise((resolve, reject) => {
      let res = []
      this.conn.bulk.query(queryString)
        .on('record', (rec) => res.push(rec))
        .on('finish', () => resolve(res))
        .on('error', (err) => reject(err))
    })
  }

  /**
   * This is same as queryLimit but make sure it won't go over the return limit
   * @param {string} queryString
   * @param {string[]} queryList
   */
  queryExtend(queryString, queryList) {
    return new Promise(async (resolve, reject) => {
      if (!queryList || !queryList.length) { resolve([]) }
      let result = []
      let start = 0
      while (start < queryList.length) {
        const localList = queryList.slice(start, start + this.querySize)
        try {
          const res = await this.simpleQuery(queryString.replace(this.QUERY_LIST, localList.join(',')))
          start += this.querySize
          result.push(res)
        } catch (e) {
          reject(e)
          break
        }
      }
      resolve(this.flatResult(result))
    })
  }

  searchExtend(queryString, queryList) {
    return new Promise(async (resolve, reject) => {
      if (!queryList || !queryList.length) { resolve([]) }
      let result = []
      let start = 0
      while (start < queryList.length) {
        const localList = queryList.slice(start, start + this.querySize)
        try {
          const searchStr = queryString.replace(this.QUERY_LIST, localList.join(' OR '))
          const found = await this.conn.search(searchStr)
          start += this.querySize
          result.push(found.searchRecords)
        } catch (e) {
          reject(e)
          break
        }
      }
      resolve(this.flatResult(result))
    })
  }

  /**
   * @param {string} objectName
   * @param {string[]} objectIds
   * @return {Promise}
   */
  retrieve(objectName, objectIds, size = 2000) {
    return new Promise(async (resolve, reject) => {
      if (!objectIds || !objectIds.length) { resolve([]) }
      let result = []
      let start = 0
      while (start < objectIds.length) {
        const localList = objectIds.slice(start, start + size)
        try {
          const subResult = await this.conn.retrieve(objectName, localList, this._sReturn)
          start += size
          result.push(subResult)
        } catch (e) {
          reject(e)
          break
        }
      }
      resolve(this.flatResult(result))
    })
  }

  /**
   * @param {string} objectName
   * @param {Object[]} objects
   * @returns {Object[]}
   */
  insert(objectName, objects) {
    return new Promise((resolve, reject) => {
      if (!objects || !objects.length) { resolve([]) }
      this.conn.bulk.load(objectName, 'insert', objects)
        .then((res) => resolve(res))
        .fail((err) => reject(err))
    })
  }

  /**
   * @param {string} objectName
   * @param {Object[]} objects
   * @param {number} size
   * @returns {Object[]}
   */
  insertSlice(objectName, objects, size = 5) {
    return new Promise(async (resolve, reject) => {
      if (!objects || !objects.length) { resolve([]) }
      let result = []
      let start = 0
      while (start < objects.length) {
        const localList = objects.slice(start, start + size)
        try {
          const subResult = await this.insert(objectName, localList)
          start += size
          result.push(subResult)
        } catch (e) {
          reject(e)
          break
        }
      }
      resolve(this.flatResult(result))
    })
  }

  /**
   * @param {string} objectName
   * @param {Object[]} objects
   * @returns {Object[]}
   */
  update(objectName, objects) {
    return new Promise((resolve, reject) => {
      if (!objects || !objects.length) { resolve([]) }
      this.conn.bulk.load(objectName, 'update', { concurrencyMode: 'Serial' }, objects)
        .then((res) => resolve(res))
        .fail((err) => reject(err))
    })
  }

  /**
   * @param {string} objectName
   * @param {string} objecyKey
   * @param {Object[]} objects
   * @returns {Object[]}
   */
  async upsert(objectName, objectKey, objects) {
    if (!objects || !objects.length) { return [] }
    let res
    if (objectKey == 'Id') {
      res = await this._upsertById(objectName, objects)
    } else {
      res = await this._upsert(objectName, objectKey, objects)
    }
    this._sMapId(objects, res)
    return res
  }

  /**
   * @param {string} objectName
   * @param {string} objecyKey
   * @param {Object[]} objects
   * @returns {Object[]}
   */
  _upsert(objectName, objectKey, objects) {
    return new Promise((resolve, reject) => {
      if (!objects || !objects.length) { resolve([]) }
      this.conn.bulk.load(objectName, 'upsert', { extIdField: objectKey, concurrencyMode: 'Serial' }, objects)
        .then((res) => resolve(res))
        .fail((err) => reject(err))
    })
  }

  /**
   * note: upsert external id will not return id in the result
   * @param {string} objectName
   * @param {Object[]} objects
   * @returns {Object[]}
   */
  async _upsertById(objectName, objects) {
    const res = new Array(objects.length)
    let updateList = []
    let insertList = []
    for (let i = 0; i < objects.length; i++) {
      const obj = objects[i]
      if (obj.Id) {
        updateList.push({ index: i, data: obj })
      } else {
        insertList.push({ index: i, data: obj })
      }
    }
    const callResult = await Promise.all([
      this.update(objectName, updateList.map((e) => e.data)),
      this.insert(objectName, insertList.map((e) => e.data)),
    ])
    for (let i = 0; i < callResult[0].length; i++) {
      const r = callResult[0][i]
      res[updateList[i].index] = r
    }
    for (let i = 0; i < callResult[1].length; i++) {
      const r = callResult[1][i]
      r.insert = true
      res[insertList[i].index] = r
    }

    return res
  }

  /**
   * @param {string} objectName
   * @param {string[]} objectIds
   * @returns {Promise}
   */
  delete(objectName, objectIds) {
    return new Promise((resolve, reject) => {
      if (!objectIds || !objectIds.length) { resolve([]) }
      this.conn.bulk.load(objectName, 'delete', objectIds.map((objId) => ({ Id: objId })))
        .then((res) => resolve(res))
        .fail((err) => reject(err))
    })
  }

  /**
   * @param {string} objName
   * @returns {Promise}
   */
  metadataRead(objName) {
    return this.conn.describe(objName, this._sReturn)
  }

  /**
   * @param {string[]} objNames
   * @returns {Object}
   */
  async loadMetadata(objNames) {
    let ret = {}
    for (let objName of objNames) {
      const metadata = await this.metadataRead(objName)
      let fieldMap = {}
      for (let f of metadata.fields) {
        fieldMap[f.name] = f
      }
      ret[metadata.name] = fieldMap
    }

    return ret
  }

  /**
   * @param {string} objectName
   * @param {string[]} names
   * @param {string} extWhereStr has to start with " WHERE ..."
   * @returns {Object}
   */
  async loadNameIdMap(objectName, names, extWhereStr) {
    if (!names || !names.length) {
      return {};
    }
    const ret = {};
    const objects = await this.soslQuery(objectName, names, extWhereStr)
    for (let obj of objects) {
      ret[obj.Name] = obj.Id;
      ret[obj.Name.toLowerCase()] = obj.Id;
    }
    return ret;
  }

  /**
   * @param {string} objectName
   * @param {string[]} names
   * @param {string} extWhereStr has to start with " WHERE ..."
   * @returns {Object[]}
   */
  async soslQuery(objectName, names, extWhereStr) {
    if (!names || !names.length) {
      return {};
    }
    let objects = []
    try {
      //escapeSosl
      names = names.map((x) => {
        let newStr = x.replace("\\", "\\\\");
        newStr = newStr.replace(/\'|\?|\&|\||\!|\{|\}|\[|\]|\(|\)|\^|\~|\*|\:|\"|\+|\-/g, '\\$&')
        return `"${newStr}"`;
      });
      const queryString = `FIND {${this.QUERY_LIST}} IN NAME FIELDS RETURNING  ${objectName} ( Id, Name  ${extWhereStr})`;
      objects = await this.searchExtend(queryString, names);
    } catch (error) {
      console.error(error);
    }
    return objects;
  }

  uploadFile(eventId, data) {
    return new Promise((resolve, reject) => {
      const filename = `Import logs ${eventId}.json`
      const dataLoad =
        `--a7V4kRcFA8E79pivMuV2tukQ85cmNKeoEgJgq
Content-Disposition: form-data; name="entity_document";
Content-Type: application/json

{
    "PathOnClient" : "${filename}"
}

--a7V4kRcFA8E79pivMuV2tukQ85cmNKeoEgJgq
Content-Type: application/octet-stream
Content-Disposition: form-data; name="VersionData"; filename="${filename}"

${JSON.stringify(data)}

--a7V4kRcFA8E79pivMuV2tukQ85cmNKeoEgJgq--`

      const options = {
        hostname: this.serverUrl,
        path: '/services/data/v23.0/sobjects/ContentVersion/',
        method: 'POST',
        headers: {
          'Content-Type': `multipart/form-data; boundary="a7V4kRcFA8E79pivMuV2tukQ85cmNKeoEgJgq"`,
          'Authorization': 'OAuth ' + this.sessionId
        }
      }
      // var base64data = new Buffer(filedata).toString('base64');
      const req = new https.request(options, (res) => {
        let data = ''
        res.on('data', (d) => {
          data += d
        })
        res.on('end', () => {
          resolve(data)
        })
      })
      req.on('error', (e) => {
        reject(e.message);
      })
      req.write(dataLoad);
      req.end()
    })
  }

  /** TODO: replace .flat() after update nodejs!! */
  flatResult(result) {
    let flatResults = []
    for (let i = 0; i < result.length; i++) {
      flatResults = flatResults.concat(result[i])
    }
    return flatResults
  }

  callApexRest() {
    // const req = {
    //    url: '/services/apexrest/pim/product/?id=a0G8Y00001Zj8TGUAZ',
    //    method: 'get',
    //    body: '',
    //    headers : {
    //            "Content-Type" : "application/json"
    //        }
    //  };
    //  this.conn.request(req, function(err, resp) {
    //   console.log('res: ', resp);
    //   console.log('err: ', err);
    // });

    
    // const options = {
    //   hostname: this.serverUrl.replace('https://', ''),
    //   path: '/services/apexrest/pim/product/?id=a0GHu000012ePdoMAE',
    //   method: 'GET',
    //   headers: {
    //     'Content-Type': `multipart/form-data; boundary="a7V4kRcFA8E79pivMuV2tukQ85cmNKeoEgJgq"`,
    //     'Authorization': 'OAuth ' + this.sessionId
    //   }
    // }
    // console.log('this.serverUrl: ', this.serverUrl.replace('https://', ''))
    // // var base64data = new Buffer(filedata).toString('base64');
    // let req = https.request(options, (res) => {
    //   console.log('res status: ', res.statusCode)
    //   console.log('HEADERS: ' + JSON.stringify(res.headers));
    //   res.setEncoding('utf8');
    //   res.on('data', function (chunk) {
    //     console.log('BODY: ' + chunk);
    //   });
    // });

    // req.on('error', function(e) {
    //   console.log('problem with request: ' + e.message);
    // });

    this.conn.apex.get(this.serverUrl.replace('https://', '') + '/services/apexrest/pim/product/?id=a0GHu000012ePdoMAE/', function(err, res) {
      if (err) { return console.error(err); }
      console.log("response: ", res);
      // the response object structure depends on the definition of apex class
    });
  }
}


module.exports = ForceService
