//const axios = require('axios');
const binance = require('node-binance-api');
const schedule = require('node-schedule');

const scheduleInterval = '0,5,10,15,20,30,35,40,45,50,55 * * * * *';
//const scheduleInterval = '0,10,20,30,45 * * * * *';
// const scheduleInterval = '0,15,30,45 * * * * *';
//const scheduleInterval = '0,30 * * * * *';
const minSpread = 0.00000001;
const avgSpreadLimiter = 0.00000001;
const quantity = 100;

let avgSpread = [];
const currency = 'XVGBTC';
const mainCurrency = 'BTC';
const secCurrency = 'XVG';
binance.options({
  'APIKEY':'TWKKt0W1SHl9DKZlTyDEoHPzueNvNOEuWo5maPDZsjkLSMmT4TQ0XAUMwInbBjKC',
  'APISECRET':'4oU0hnobeLdbGFz9QtcM0wNOgINQuny5IAorIq1bSgrjgAPLttDzII52MaRN39Ba'
});


exports.startProgram = (req, res, next) => {
  let TradeHistoryProfit = [];
  let allOpenOrders = [];
  let spd = null,
    tickerInfo = null;

  const j = schedule.scheduleJob(scheduleInterval, () => {
    binance.balance(balances => {
      console.log('BTC: ', balances[mainCurrency].available);
      console.log('XVG: ', balances[secCurrency].available);
      console.log('BNB: ', balances.BNB.available);
    });

    binance.bookTickers((ticker) => {
      tickerInfo = ticker;
      spd = ticker[currency].ask - ticker[currency].bid;
      avgSpread.push(spd);

      console.log('Ask: ', ticker[currency].ask);
      console.log('Bid: ', ticker[currency].bid);
      console.log('SPD: ', spd.toFixed(8));
      console.log('AVS: ', getAverageSpread(avgSpread));
      console.log('AVL: ', avgSpread.length);

      if (avgSpread.length == 101) {
        avgSpread.shift();
      }

      if (avgSpread.length < 0) {
        console.log('Waiting for AVL level 10...');
        console.log('******************************');
      } else {
        binance.openOrders(currency, (openOrders, symbol) => {
          allOpenOrders = openOrders;

          if (allOpenOrders.length == 0) {
            console.log('No Open Orders.');

            if (spd.toFixed(8) >= minSpread && spd.toFixed(8) >= avgSpreadLimiter) {
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

                // relistSell(calculateMargin(openOrder.price, tickerInfo[currency].ask), openOrder.price);

              } else {
                console.log('CST', openOrder.side, 'at', calculateMargin(openOrder.price, tickerInfo[currency].ask));

                if (spd.toFixed(8) >= minSpread && spd.toFixed(8) >= avgSpreadLimiter) {
                  console.log('SPD && AVS: Match');
                  if (calculateMargin(openOrder.price, tickerInfo[currency].ask) > 0.00000002) {
                    binance.cancel(currency, openOrder.orderId, function(response, symbol) {
                      //cancelAll = true;
                      console.log('Canceled order #: ', + openOrder.orderId);
                      //console.log('******************************');
                      //makeBuyOrder(tickerInfo[currency].bid, spd);
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
  return avg.toFixed(8);
}

function calculateMargin(openPrice, currentPrice) {
  const profit = currentPrice - openPrice;
  return profit.toFixed(8);
}

function generateBuySellOrder(bid, spd) {
  const buyPrice = parseFloat(bid) + parseFloat(0.00000050),
    sellPrice = parseFloat(buyPrice) + parseFloat(spd) - parseFloat(0.00000150);

  console.log('im going to buy at ', parseFloat(buyPrice).toFixed(8));
  console.log('then im going to create a sell order for ', sellPrice.toFixed(8));

  //binance.buy(currency, quantity, buyPrice);
  binance.buy(currency, quantity, buyPrice, {}, function(response) {
    //console.log('Limit Buy response', response);
    console.log('buy order id: ' + response.orderId);
    //binance.sell(currency, quantity, sellPrice.toFixed(8));
    binance.sell(currency, quantity, sellPrice.toFixed(8), {}, function(sellOneResponse) {
      console.log('sell order id: ' + sellOneResponse);
      if (sellOneResponse.orderId == undefined) {
        binance.sell(currency, quantity, sellPrice.toFixed(8), {}, function(sellTwoResponse) {
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
  // binance.sell(currency, quantity, sellPrice.toFixed(8));
  // console.log('PFT: ', sellPrice - buyPrice);
}

function relistSell(cst, orderPrice) {
  const sellPrice = parseFloat(orderPrice) - parseFloat(cst) * -1;
  if (cst >= -0.00000001) {
    binance.cancelOrders(currency, function(response, symbol) {
      binance.sell(currency, quantity, sellPrice.toFixed(8), {}, marketSellResponse => {
        console.log('Sold @: ', sellPrice );
        console.log('Sell order id: ' + marketSellResponse.orderId);
        console.log('******************************');
      });
    });
  } else {
    console.log('Waiting for Quick Sell.');
    console.log('******************************');
  }
}

function makeBuyOrder(bid, spd) {
  const buyPrice = parseFloat(bid),
    sellPrice = parseFloat(buyPrice) + parseFloat(spd);

  binance.buy(currency, quantity, buyPrice, {}, buyResponse => {
    console.log('Bought @:', buyPrice.toFixed(8));
    console.log('Buy order id: ' + buyResponse.orderId);
    //console.log('******************************');
    const t = schedule.scheduleJob('* * * * * *', () => {
      binance.openOrders(currency, (openOrders, symbol) => {
        if (openOrders.length == 0) {
          t.cancel();
          // if (cancelAll) {
          //   console.log('******************************');
          // } else {
          binance.sell(currency, quantity, sellPrice.toFixed(8), {}, sellResponse => {
            console.log('Sold @:', sellPrice.toFixed(8));
            console.log('Sell order id: ' + sellResponse.orderId);
            console.log('******************************');
          });
          // }
        } else {
          console.log('Status: Open');
          //console.log('******************************');
        }
      });
    });
  });
}
