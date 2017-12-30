const binance = require('node-binance-api');
const schedule = require('node-schedule');

const mainInterval = '5s';
const minSpread = 0.00000400;
const avgSpreadLimiter = 0.00000400;
const stopLossLimit = -0.00000100;
const decimalPlace = 8;
// const quantityMin = 50;
// const quantityMax = 60;
let quantity = 150;
// let quantity = Math.floor(Math.random() * (quantityMax - quantityMin + 1)) + parseInt(quantityMin);
const avlToStart = 5;
const avlMax = 100;
let avgSpread = [];
let avgHigh = [];
let avgLow = [];
const currency = 'XRPETH';
const mainCurrency = 'ETH';
const secCurrency = 'XRP';
const cstMaxToCancelBuy = 0.00000400;
const cstStopLossStart = -0.00000400;
const cstStopLossEnd = -0.00000800;
const cstRelistSell = -0.00000050;

binance.options({
  'APIKEY':'TWKKt0W1SHl9DKZlTyDEoHPzueNvNOEuWo5maPDZsjkLSMmT4TQ0XAUMwInbBjKC',
  'APISECRET':'4oU0hnobeLdbGFz9QtcM0wNOgINQuny5IAorIq1bSgrjgAPLttDzII52MaRN39Ba'
});

exports.startProgram = (req, res, next) => {
  let TradeHistoryProfit = [];
  let allOpenOrders = [];
  let spd = null,
    tickerInfo = null,
    secCurrencyBalance = null;

  const j = schedule.scheduleJob(getMainInterval(mainInterval), () => {
    binance.balance(balances => {
      console.log('ETH: ', balances[mainCurrency].available);
      console.log('XRP: ', balances[secCurrency].available);
      console.log('BNB: ', balances.BNB.available);
      secCurrencyBalance = balances[secCurrency].available;
    });

    binance.bookTickers((ticker) => {
      tickerInfo = ticker;
      spd = ticker[currency].ask - ticker[currency].bid;
      avgSpread.push(spd);

      console.log('Ask: ', ticker[currency].ask);
      console.log('Bid: ', ticker[currency].bid);
      console.log('SPD: ', spd.toFixed(decimalPlace));
      console.log('AVS: ', getAverageSpread(avgSpread));
      console.log('AVL: ', avgSpread.length);
      //binance.buy(currency, quantity, ticker[currency].bid);

      if (avgSpread.length == avlMax) {
        avgSpread.shift();
      }

      if (avgSpread.length < avlToStart) {
        console.log('Waiting for AVL level ' + avlToStart + '...');
        console.log('******************************');
      } else {
        binance.openOrders(currency, (openOrders, symbol) => {
          allOpenOrders = openOrders;

          if (allOpenOrders.length == 0 && secCurrencyBalance > 1) {
            sellLeftover();
          } else if (allOpenOrders.length == 0) {
            console.log('No Open Orders.');

            if (spd.toFixed(decimalPlace) >= minSpread && getAverageSpread(avgSpread) >= avgSpreadLimiter) {
              console.log('SPD && AVS: Match');
              makeBuyOrder(tickerInfo[currency].bid, spd);

            } else {
              console.log('SPD && AVS: MisMatch');
              console.log('******************************');
            }

          } else {
            allOpenOrders.forEach(openOrder => {
              console.log('OPD', openOrder.side, 'at', openOrder.price);

              if (openOrder.side == 'SELL') {
                console.log('CST', openOrder.side, 'at', calculateMargin(openOrder.price, tickerInfo[currency].ask));

                if (spd.toFixed(decimalPlace) >= minSpread && spd.toFixed(decimalPlace) >= avgSpreadLimiter) {
                  console.log('SPD && AVS: Match');
                  console.log('Relisting Sell...');
                  relistSell(calculateMargin(openOrder.price, tickerInfo[currency].ask), openOrder.price);
                }

              } else {
                console.log('CST', openOrder.side, 'at', calculateMargin(openOrder.price, tickerInfo[currency].ask));

                if (spd.toFixed(decimalPlace) >= minSpread && spd.toFixed(decimalPlace) >= avgSpreadLimiter) {
                  console.log('SPD && AVS: Match');
                  if (calculateMargin(openOrder.price, tickerInfo[currency].ask) > cstMaxToCancelBuy) {
                    binance.cancel(currency, openOrder.orderId, function(response, symbol) {
                      console.log('Canceled order #: ', + openOrder.orderId);

                    });
                  } else {
                    console.log('CST: MisMatch');
                    console.log('Status: Open');
                    console.log('******************************');
                  }
                } else {
                  console.log('SPD && AVS: MisMatch');
                  console.log('******************************');
                }
              }
            });
          }
        });
      }
    });
  });
};

function getAverageSpread(spreads) {
  let sum = 0;
  for( let i = 0; i < spreads.length; i++ ){
    sum += spreads[i]; //don't forget to add the base
  }
  const avg = sum/spreads.length;
  return avg.toFixed(decimalPlace);
}

function calculateMargin(openPrice, currentPrice) {
  const profit = currentPrice - openPrice;
  return profit.toFixed(decimalPlace);
}

function generateBuySellOrder(bid, spd) {
  const buyPrice = parseFloat(bid) + parseFloat(0.00000050),
    sellPrice = parseFloat(buyPrice) + parseFloat(spd) - parseFloat(0.00000200);

  console.log('im going to buy at ', parseFloat(buyPrice).toFixed(decimalPlace));
  console.log('then im going to create a sell order for ', sellPrice.toFixed(decimalPlace));

  binance.buy(currency, quantity, buyPrice, {}, function(response) {
    console.log('buy order id: ' + response.orderId);

    binance.sell(currency, quantity, sellPrice.toFixed(decimalPlace), {}, function(sellOneResponse) {
      console.log('sell order id: ' + sellOneResponse);
      if (sellOneResponse.orderId == undefined) {
        binance.sell(currency, quantity, sellPrice.toFixed(decimalPlace), {}, function(sellTwoResponse) {
          console.log('Had to rerun sell limit order.');
          console.log('2nd try sell order id: ' + sellTwoResponse.orderId);
          if (sellTwoResponse.orderId == undefined) {
            binance.cancelOrders(currency, function(response, symbol) {
              console.log('Canceling All Orders and Starting Fresh.');
              console.log('******************************');
            });
          }
        });
      }
      console.log('PFT: ', sellPrice - buyPrice);
    });
  });
}

function relistSell(cst, orderPrice) {
  const sellPrice = parseFloat(orderPrice) - parseFloat(cst) * -1;

  if (cst >= cstRelistSell) {
    binance.cancelOrders(currency, function(response, symbol) {
      binance.sell(currency, quantity, sellPrice.toFixed(decimalPlace), {}, marketSellResponse => {
        console.log('Sold @: ', sellPrice );
        console.log('Sell order id: ' + marketSellResponse.orderId);
        console.log('******************************');
      });
    });
  } else if (cst <= cstStopLossStart && cst >= cstStopLossEnd) {
    binance.cancelOrders(currency, function(response, symbol) {
      binance.sell(currency, quantity, sellPrice.toFixed(decimalPlace), {}, marketSellResponse => {
        console.log('Sold @: ', sellPrice );
        console.log('Sell order id: ' + marketSellResponse.orderId);
        console.log('******************************');
      });
    });
  }
  else {
    console.log('Waiting for Quick Sell/Stop Loss.');
    console.log('******************************');
  }
}

function makeBuyOrder(bid, spd) {
  const buyPrice = parseFloat(bid) + parseFloat(0.00000050),
    sellPrice = parseFloat(buyPrice) + parseFloat(spd) - parseFloat(0.00000150);

  binance.buy(currency, quantity, buyPrice, {}, buyResponse => {
    console.log('Bought @:', buyPrice.toFixed(decimalPlace));
    console.log('Buy order id: ' + buyResponse.orderId);
    //console.log('******************************');
    const t = schedule.scheduleJob('* * * * * *', () => {
      binance.openOrders(currency, (openOrders, symbol) => {
        if (openOrders.length == 0) {
          binance.sell(currency, quantity, sellPrice.toFixed(decimalPlace), {}, sellResponse => {
            console.log('Sold @:', sellPrice.toFixed(decimalPlace));
            console.log('Sell order id: ' + sellResponse.orderId);
            makeStopLossSell();
            t.cancel();
          });
        } else {
          console.log('Buy Status: Open');
        }
      });
    });
  });
}

function makeStopLossSell() {
  const t = schedule.scheduleJob('* * * * * *', () => {
    binance.bookTickers((ticker) => {
      binance.openOrders(currency, (openOrders, symbol) => {
        if (openOrders.length == 0) { t.cancel(); }
        openOrders.forEach(openOrder => {

          if (openOrder.side == 'SELL') {
            if (calculateMargin(openOrder.price, ticker[currency].ask) <= cstStopLossStart && calculateMargin(openOrder.price, ticker[currency].ask) >= cstStopLossEnd) {
              binance.cancel(currency, openOrder.orderId, function(response, symbol) {
                console.log('Canceled order #: ', + openOrder.orderId);
                binance.sell(currency, quantity, ticker[currency].ask, {}, sellResponse => {
                  console.log('Sold @:', ticker[currency].ask);
                  console.log('Sell order id: ' + sellResponse.orderId);
                  console.log('******************************');
                });
              });
            } else {
              console.log('Sell Status: Open');
              console.log('CST', openOrder.side, 'at', calculateMargin(openOrder.price, ticker[currency].ask));
            }
          } else {
            t.cancel();
          }

        });
      });
    });
  });
}

function getMainInterval(int) {
  switch (int) {
    case '5s':
      return '0,5,10,15,20,30,35,40,45,50,55 * * * * *';
    case '10s':
      return '0,10,20,30,45 * * * * *';
    case '15s':
      return '0,15,30,45 * * * * *';
    case '30s':
      return '0,30 * * * * *';
    default:
      return '0,30 * * * * *';
  }
}

function sellLeftover() {
  let leftOverBalance = null;
  const t = schedule.scheduleJob('* * * * * *', () => {
    binance.balance(balances => {
      leftOverBalance = balances[secCurrency].available;
      binance.bookTickers((ticker) => {
        binance.openOrders(currency, (openOrders, symbol) => {
          if (leftOverBalance > 5 && openOrders.length == 0) {
            binance.sell(currency, Math.floor(leftOverBalance), ticker[currency].ask, {}, leftOverSellResponse => {
              console.log('Left over qty:', leftOverBalance);
              console.log('Sold Left Over @: ', ticker[currency].ask );
              console.log('Sell order id: ' + leftOverSellResponse.orderId);
              console.log('******************************');
            });
          } else { t.cancel(); }
        });
      });
    });
  });
}

// const binance = require('node-binance-api');
// const schedule = require('node-schedule');
//
// const mainInterval = '5s';
// const minSpread = 0.00000400;
// const avgSpreadLimiter = 0.00000400;
// const stopLossLimit = -0.00000100;
// const decimalPlace = 8;
// let quantity = 100;
// const avlToStart = 1;
// const avlMax = 100;
// let avgSpread = [];
// let avgHigh = [];
// let avgLow = [];
// const currency = 'XRPETH';
// const mainCurrency = 'ETH';
// const secCurrency = 'XRP';
// let cstMaxToCancelBuy = 0.00000800;
// let cstStopLossStart = -0.00000800;
// let cstStopLossEnd = -0.00004000;
// const cstRelistSell = -0.00000100;
// let j = null;
// binance.options({
//   'APIKEY':'TWKKt0W1SHl9DKZlTyDEoHPzueNvNOEuWo5maPDZsjkLSMmT4TQ0XAUMwInbBjKC',
//   'APISECRET':'4oU0hnobeLdbGFz9QtcM0wNOgINQuny5IAorIq1bSgrjgAPLttDzII52MaRN39Ba'
// });
//
// exports.startProgram = (req, res, next) => {
//   let TradeHistoryProfit = [];
//   let allOpenOrders = [];
//   let spd = null,
//     tickerInfo = null,
//     secCurrencyBalance = null;
//   //binance.buy(currency, quantity, 0.00347397);
//   j = schedule.scheduleJob(getMainInterval(mainInterval), () => {
//     binance.balance(balances => {
//       console.log('ETH: ', balances[mainCurrency].available);
//       console.log('XRP: ', balances[secCurrency].available);
//       console.log('BNB: ', balances.BNB.available);
//       secCurrencyBalance = balances[secCurrency].available;
//     });
//
//     binance.bookTickers((ticker) => {
//       tickerInfo = ticker;
//       spd = ticker[currency].ask - ticker[currency].bid;
//       avgSpread.push(spd);
//
//       console.log('Ask: ', ticker[currency].ask);
//       console.log('Bid: ', ticker[currency].bid);
//       console.log('SPD: ', spd.toFixed(decimalPlace));
//       console.log('AVS: ', getAverageSpread(avgSpread));
//       console.log('AVL: ', avgSpread.length);
//       cstMaxToCancelBuy = getAverageSpread(avgSpread);
//       cstStopLossStart = (parseFloat(getAverageSpread(avgSpread)) + (getAverageSpread(avgSpread) * 1)) * -1;
//       cstStopLossEnd = cstStopLossStart * 3;
//       console.log('MTC: ', cstMaxToCancelBuy);
//       console.log('SLS: ', cstStopLossStart.toFixed(decimalPlace));
//       console.log('SLE: ', cstStopLossEnd.toFixed(decimalPlace));
//
//       if (avgSpread.length == avlMax) {
//         avgSpread.shift();
//       }
//
//       if (avgSpread.length < avlToStart) {
//         console.log('Waiting for AVL level ' + avlToStart + '...');
//         console.log('******************************');
//       } else {
//         binance.openOrders(currency, (openOrders, symbol) => {
//           allOpenOrders = openOrders;
//
//           if (allOpenOrders.length == 0 && secCurrencyBalance < 20) {
//
//             //sellLeftover();
//
//           } else if (allOpenOrders.length == 0) {
//             console.log('No Open Orders.');
//
//             if (spd.toFixed(decimalPlace) >= minSpread && spd.toFixed(decimalPlace) >= avgSpreadLimiter) {
//               console.log('SPD && AVS: Match');
//               makeBuyOrder(tickerInfo[currency].bid, spd);
//
//             } else {
//               console.log('SPD && AVS: MisMatch');
//               console.log('******************************');
//             }
//
//           } else {
//             allOpenOrders.forEach(openOrder => {
//               console.log('OPD:', openOrder.price);
//               console.log('CST:', calculateMargin(openOrder.price, tickerInfo[currency].ask));
//
//               if (openOrder.side == 'SELL') {
//                 console.log('Previous Trade In Progress...');
//                 console.log('******************************');
//                 //relistSell(calculateMargin(openOrder.price, tickerInfo[currency].ask), openOrder.price);
//                 handleOpenOrderSell();
//
//               } else {
//
//                 if (spd.toFixed(decimalPlace) >= minSpread && spd.toFixed(decimalPlace) >= avgSpreadLimiter) {
//                   console.log('SPD && AVS: Match');
//                   if (calculateMargin(openOrder.price, tickerInfo[currency].ask) > cstMaxToCancelBuy) {
//                     binance.cancel(currency, openOrder.orderId, function(response, symbol) {
//                       console.log('Canceling to re-buy...');
//                       console.log('Cancel order id: ', + openOrder.orderId);
//                     });
//                   } else {
//                     console.log('CST: MisMatch');
//                     console.log('Status: Open');
//                     console.log('******************************');
//                   }
//                 } else {
//                   console.log('SPD && AVS: MisMatch');
//                   console.log('******************************');
//                 }
//               }
//             });
//           }
//         });
//       }
//     });
//   });
// };
//
// function getAverageSpread(spreads) {
//   let sum = 0;
//   for( let i = 0; i < spreads.length; i++ ){
//     sum += spreads[i]; //don't forget to add the base
//   }
//   const avg = sum/spreads.length;
//   return avg.toFixed(decimalPlace);
// }
//
// function calculateMargin(openPrice, currentPrice) {
//   const profit = currentPrice - openPrice;
//   return profit.toFixed(decimalPlace);
// }
//
// function generateBuySellOrder(bid, spd) {
//   const buyPrice = parseFloat(bid) + parseFloat(0.00000050),
//     sellPrice = parseFloat(buyPrice) + parseFloat(spd) - parseFloat(0.00000150);
//
//   console.log('im going to buy at ', parseFloat(buyPrice).toFixed(decimalPlace));
//   console.log('then im going to create a sell order for ', sellPrice.toFixed(decimalPlace));
//
//   binance.buy(currency, quantity, buyPrice, {}, function(response) {
//     console.log('buy order id: ' + response.orderId);
//
//     binance.sell(currency, quantity, sellPrice.toFixed(decimalPlace), {}, function(sellOneResponse) {
//       console.log('sell order id: ' + sellOneResponse);
//       if (sellOneResponse.orderId == undefined) {
//         binance.sell(currency, quantity, sellPrice.toFixed(decimalPlace), {}, function(sellTwoResponse) {
//           console.log('Had to rerun sell limit order.');
//           console.log('2nd try sell order id: ' + sellTwoResponse.orderId);
//           if (sellTwoResponse.orderId == undefined) {
//             binance.cancelOrders(currency, function(response, symbol) {
//               console.log('Canceling All Orders and Starting Fresh.');
//               console.log('******************************');
//             });
//           }
//         });
//       }
//       console.log('PFT: ', sellPrice - buyPrice);
//     });
//   });
// }
//
// function relistSell(sellPrice, orderId) {
//   binance.cancel(currency, orderId, response => {
//     console.log('Canceled order #: ', + orderId);
//     binance.sell(currency, quantity, sellPrice, {}, relistSellResponse => {
//       console.log('Relist sell price: ', sellPrice );
//       console.log('Relist sell Order id: ' + relistSellResponse.orderId);
//       console.log('******************************');
//     });
//   });
// }
//
// function handleStopLossSell(sellPrice, orderId) {
//   binance.cancel(currency, orderId, response => {
//     console.log('Canceled order #: ', + orderId);
//     binance.sell(currency, quantity, sellPrice, {}, stopSellResponse => {
//       console.log('StopLossSell:', sellPrice);
//       console.log('Sale id: ' + stopSellResponse.orderId);
//       console.log('******************************');
//     });
//   });
// }
//
// let ii = 0;
// function makeBuyOrder(bid, spd) {
//   const buyPrice = parseFloat(bid) + (parseFloat(spd) * .3),
//     sellPrice = (parseFloat(buyPrice) + parseFloat(spd)) - (parseFloat(spd) * .3);
//   console.log('BPC:',buyPrice.toFixed(decimalPlace));
//   console.log('SPC:',sellPrice.toFixed(decimalPlace));
//   binance.openOrders(currency, (openOrders, symbol) => {});
//
//   const makeBuyT = schedule.scheduleJob('* * * * * *', () => {
//     ii++;
//     binance.buy(currency, quantity, buyPrice.toFixed(decimalPlace), {}, buyResponse => {
//       if (buyResponse.orderId == undefined) {
//         console.log('Buy order: FAILED');
//       } else {
//         console.log('Buy order price:', buyPrice.toFixed(decimalPlace));
//         console.log('Buy order id: ' + buyResponse.orderId);
//         binance.openOrders(currency, (openOrders, symbol) => {
//           if (openOrders.length == 0) {
//             console.log('Trying to sell...');
//             binance.sell(currency, quantity, sellPrice.toFixed(decimalPlace), {}, sellResponse => {
//               if (sellResponse.orderId == undefined) {
//                 console.log('Sell order: FAILED');
//
//                 if (ii == 5) {
//                   makeBuyT.cancel();
//                 }
//               } else {
//                 console.log('Sell order price:', sellPrice.toFixed(decimalPlace));
//                 console.log('Sell order id: ' + sellResponse.orderId);
//                 makeBuyT.cancel();
//                 checkIfSold();
//               }
//             });
//           } else {
//             if(ii == 5) {makeBuyT.cancel();}
//             console.log('Buy order status: Open');
//             console.log('******************************');
//           }
//         });
//       }
//     });
//   });
// }
//
// function checkIfSold() {
//   const st = schedule.scheduleJob('* * * * * *', () => {
//     binance.bookTickers((ticker) => {
//       binance.openOrders(currency, (openOrders, symbol) => {
//         if (openOrders.length == 0) {
//           console.log('Sold');
//           console.log('******************************');
//           st.cancel();
//         } else {
//           console.log('Sell Pending...');
//           StopLoss(openOrders, ticker, st);
//         }
//       });
//     });
//   });
// }
//
// function StopLoss(openOrders, ticker, st) {
//   //console.log(openOrders[0]);
//   openOrders.forEach(openOrder => {
//     if (openOrder.side == 'SELL') {
//       if (calculateMargin(openOrder.price, ticker[currency].ask) <= cstStopLossStart && calculateMargin(openOrder.price, ticker[currency].ask) >= cstStopLossEnd) {
//         binance.cancel(currency, openOrder.orderId, function(response, symbol) {
//           console.log('Canceled order #: ', + openOrder.orderId);
//           binance.sell(currency, quantity, ticker[currency].ask, {}, sellResponse => {
//             console.log('SPC:', ticker[currency].ask);
//             console.log('SID:' + sellResponse.orderId);
//             console.log('******************************');
//           });
//         });
//       } else {
//         console.log('Stop Loss In Order...');
//         console.log('CST:', calculateMargin(openOrder.price, ticker[currency].ask));
//       }
//     } else {
//       st.cancel();
//     }
//   });
// }
//
// function getMainInterval(int) {
//   switch (int) {
//     case '*s':
//       return '* * * * * *';
//     case '5s':
//       return '0,5,10,15,20,30,35,40,45,50,55 * * * * *';
//     case '10s':
//       return '0,10,20,30,45 * * * * *';
//     case '15s':
//       return '0,15,30,45 * * * * *';
//     case '30s':
//       return '0,30 * * * * *';
//     default:
//       return '0,30 * * * * *';
//   }
// }
//
// function sellLeftover() {
//   let leftOverBalance = null;
//   const t = schedule.scheduleJob('* * * * * *', () => {
//     binance.balance(balances => {
//       leftOverBalance = balances[secCurrency].available;
//       binance.bookTickers((ticker) => {
//         binance.openOrders(currency, (openOrders, symbol) => {
//           if (leftOverBalance > 5 && openOrders.length == 0) {
//             binance.sell(currency, Math.floor(leftOverBalance), ticker[currency].ask, {}, leftOverSellResponse => {
//               console.log('Left over qty:', leftOverBalance);
//               console.log('Sold Left Over @: ', ticker[currency].ask );
//               console.log('Sell order id: ' + leftOverSellResponse.orderId);
//               console.log('******************************');
//             });
//           } else { t.cancel(); }
//         });
//       });
//     });
//   });
// }
//
// let i = 0;
//
// function handleOpenOrderSell() {
//   const hoosT = schedule.scheduleJob('* * * * * *', () => {
//     binance.bookTickers((ticker) => {
//       binance.openOrders(currency, (openOrders, symbol) => {
//         if (openOrders.length == 0) {
//           console.log('Open Order Sold...');
//           console.log('******************************');
//           hoosT.cancel();
//         } else {
//           openOrders.forEach((openOrder, i) => {
//             const cstValue = calculateMargin(openOrder.price, ticker[currency].ask);
//             if (cstValue >= cstRelistSell) {
//               const price = parseFloat(openOrder.price) + cstValue;
//
//               //relistSell(price, openOrder.orderId);
//
//             } else if (cstValue <= cstStopLossStart && cstValue >= cstStopLossEnd) {
//               const price = parseFloat(openOrder.price) + cstValue;
//
//               handleStopLossSell(ticker[currency].ask, openOrder.orderId);
//
//             } else {
//               i++;
//               if(i == 5) { hoosT.cancel(); }
//               console.log('Open Sell Item');
//               console.log('CST:', cstValue);
//             }
//
//           });
//         }
//       });
//     });
//   });
// }
