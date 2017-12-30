import express from 'express';
import WebpackDevServer from 'webpack-dev-server';
import webpack from 'webpack';

const app = express();
const port = 4000;
//const devPort = 5000;
const server = require('http').createServer(app);
const io = require('socket.io').listen(server);
const xvgbtcControllers = require('./controllers/xvgbtcControllers');
const cors = require('cors');

app.use(cors());

io.sockets.on('connection', onSocketConnect);

function onSocketConnect(socket) {
  console.log('Socket.io Client Connected');

  socket.on('disconnect', function(){
    console.log('Socket.io Client Disconnected');
  });
}

server.listen(port, (req, res) => {
  console.log('Express listening on port', port);
}, xvgbtcControllers.startProgram);
