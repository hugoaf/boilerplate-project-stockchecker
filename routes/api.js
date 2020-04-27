/*
 *
 *
 *       Complete the API routing below
 *
 *
 */

'use strict';

var expect = require('chai').expect;
var MongoClient = require('mongodb');
const axios = require('axios');

const CONNECTION_STRING = process.env.CONNECTION_STRING;
//MongoClient.connect(CONNECTION_STRING, function(err, db) {});

module.exports = function (app) {
  app.route('/api/stock-prices').get(function (req, res) {
    let symbolQuery = req.query.stock;
    let like = req.query.like;
    let symbolArray = [];

    if (typeof symbolQuery === 'object') {
      symbolArray.push(...symbolQuery);
    } else {
      symbolArray.push(symbolQuery);
    }

    // if only one symbol, save like to db
    if (symbolArray.length === 1) {
      MongoClient.connect(CONNECTION_STRING, function (err, client) {
        let db = client.db('stockdata');
        let collection = db.collection('stocks');
        let ip = req.headers['x-forwarded-for'].split(',')[0];
        let data = {
          symbol: symbolArray[0],
          ip: ip,
          like: !!like,
        };

        collection.findOneAndUpdate(
          { symbol: symbolArray[0], ip: ip },
          { $set: data },
          { new: true, upsert: true },
          function (err, doc) {
            console.log('find updated  ' + doc);
          }
        );

      });
    }

    // will count likes
    const countLikesInDb = async (symbol) => {
      var executeDbQueryPromise = (symbol) => {
        return new Promise((resolve, reject) => {
          MongoClient.connect(CONNECTION_STRING, async function (err, client) {
            let db = client.db('stockdata');
            let collection = db.collection('stocks');
            let countResult = 0;

            //declare promise
            var findInDbPromise = (symbol) => {
              return new Promise((resolve, reject) => {
                collection.find({ symbol: symbol }).count( (err, count) => {
                  if (err) {
                    res.send('error getting likes');
                  } else {
                    resolve(count);
                  }
                });
              });
            };
            
            //await myPromise
            countResult = await findInDbPromise(symbol);
            //console.log('countResult',countResult);
            resolve(countResult);
          });
        });
      };
      const result = await executeDbQueryPromise(symbol);
      return result;
      
    }

  
    // console.log('symbolArray', symbolArray);

    // build a requests array
    let requests = [];
    symbolArray.forEach((symbol) => {
      requests.push(
        axios.get(`https://repeated-alpaca.glitch.me/v1/stock/${symbol}/quote`)
      );
    });

    // chain request and do task after
    let stockData = [];
    axios.all(requests).then( async (responses) => {
      //console.log(responses);
      const buildResponse = async (responses)=>{
        for (let i = 0; i < responses.length; i++) {
          //console.log('response', responses[i].data);
          let likesCount = await countLikesInDb(responses[i].data.symbol);
          console.log('likesCount',likesCount);
          stockData.push({
            stock: responses[i].data.symbol,
            price: responses[i].data.latestPrice,
            likes: likesCount,

          });
        };            
        //console.log('stockData', stockData)
        return stockData;
      }
      let responseArray = await buildResponse(responses);
      // console.log('responseArray', responseArray)

      if (responseArray.length > 1) {
        // calculate relative likes
        responseArray[0].rel_likes = responseArray[0].likes - responseArray[1].likes;
        responseArray[1].rel_likes = responseArray[1].likes - responseArray[0].likes;
        delete responseArray[0].likes;
        delete responseArray[1].likes;
        res.json({ stockData: responseArray });
      } else {
        res.json({ stockData: responseArray[0] });
      }

    });

  });
};

