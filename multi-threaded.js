let mosca = require('mosca');
var cluster = require('cluster');
//const numCPUs = require('os').cpus().length;
var sticky = require('sticky-session');
let bodyParser = require('body-parser');
var appPort = 5000;

if (cluster.isMaster) {
  // we create a HTTP server, but we do not use listen
  // that way, we have a socket.io server that doesn't accept connections
  var server = require('http').createServer();
  var io = require('socket.io').listen(server);
  var redis = require('socket.io-redis');

  io.adapter(redis({ host: 'localhost', port: 6379 }));

  // setInterval(function () {
  //   // all workers will receive this in Redis, and emit
  //   io.emit('data', 'payload');
  // }, 1000);

  // Creat workers from master. Sample code and in general people do create (or fork) workers equals to the cpu cores.
  // But it can be greater than the CPU cores. Try uncommenting and statically putting any number in place of numCPUs in the loop
  /*for (var i = 0; i < numCPUs; i++) {
    cluster.fork();
  }*/ // No need to do fork as we have used sticky-sessions and sticky.listen() already creates worker for us.

  cluster.on('exit', function (worker, code, signal) {
    console.log('worker ' + worker.process.pid + ' died');
  });
}

var express = require('express');
var app = express();

let http = require('http').Server(app);
var io = require('socket.io').listen(http);
var redis = require('socket.io-redis');

if (cluster.isWorker) {
  // console.log("Worker "+cluster.worker.id+" created.")

  // var server = http.createServer(app);
  app.use(bodyParser.json());
  app.use(bodyParser.urlencoded({ extended: false }));
  io.adapter(redis({ host: 'localhost', port: 6379 }));

  io.on('connection', function (socket) { //connect socket event is here
    console.log("socket", socket.handshake.query.token);
    if (socket.handshake.query.token !== undefined) {
      socket.join(socket.handshake.query.token);
    }
    socket.emit('data', 'connected to worker: ' + cluster.worker.id);
    
    socket.on('disconnect', function () { //Each socket also fires a special disconnect event:
      // console.log("disconnect", socket.id);
      console.log("disconnect", socket.handshake.query.token);
      socket.leave(socket.handshake.query.token);
    });

    socket.on('reconnect', function () { //Each socket also fires a special disconnect event:
      console.log("reconnect", socket.id);
      if (socket.handshake.query.token !== undefined) {
        socket.join(socket.handshake.query.token);
      }
    });
  });

  let config = {
    "mqtt": {
      "port": 1883,
      "http_port": 1884
    }
  };

  var ascoltatore = {
    type: 'redis',
    redis: require('redis'),
    db: 12,
    port: 6379,
    return_buffers: true, // to handle binary payloads
    host: 'localhost'
  };;

  //create connection settings for MQTT
  let settings = {
    port: config.mqtt.port,
    backend: ascoltatore,
    stats: false,
    logger: {},
    http: {
      port: config.mqtt.http_port,
      bundle: true
    }
  };

  //create MQTT server on port 1883
  let mqttServer = new mosca.Server(settings);
  mqttServer.on('ready', setup);

  app.use(function (request, response, next) {
    response.header("Access-Control-Allow-Origin", "*");
    response.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept, api-key,udid,device-type,Authorization");
    next();
  });

  //Api endpoint for socket
  app.get("/socket_mqtt_notification/:client_code", async function (req, res) {
    if (req.params.client_code) {
      let postData = { "method": "take_update" };

      let mqttORsocket = {
        mqtt: 0,
        socket: 0
      }

      // decide whether to publish on socket.io or to mqtt or on both
      if (req.params.client_code == 111) {
        mqttORsocket.socket = 1;
      } else if (req.params.client_code == 222) {
        mqttORsocket.mqtt = 1;
      } else {
        mqttORsocket.socket = 1;
        mqttORsocket.mqtt = 1;
      }

      if (mqttORsocket.mqtt == 1) {
        mqttPublish(req.params.client_code, postData);
      }

      if (mqttORsocket.socket == 1) {
        SocketPublishIO(req.params.client_code, "take_update");
      }
      console.log(postData);
      res.send({ error: "" });
    } else {
      res.send({ error: "invalid code" });
    }

  });

  function setup() {
    console.log('Mosca(mqttt) server is up and running.....', settings.port);
  }

  let mqttPublish = function (topic, data) {
    let message = {
      topic: topic,
      payload: JSON.stringify(data), // or a Buffer
      qos: 1, // 0, 1, or 2
      retain: false // or true
    };
    console.log("mqtt publish on worker :- ",cluster.worker.id);
    mqttServer.publish(message, function () {
      // console.log('publish done!',message);
    });
  };

  let SocketPublishIO = function (topic_or_room, data) {
    console.log("socket publish on worker :- ",cluster.worker.id);
    // helpful url for redis adapter https://github.com/socketio/socket.io-redis
    io.in(topic_or_room).clients((err, clients) => {
      if (err) {
        //console.log("Error");
      } else if (clients.length > 0) { // If any clients found for that room than consider it as room emit else broadcast
        // console.log("Emitting to socket room " + topic_or_room, "Worker id is :- " + cluster.worker.id);
        io.to(topic_or_room).emit(topic_or_room, data);
      } else {
        // console.log("Emitting without room " + topic_or_room, "Worker id is :- " + cluster.worker.id);
        io.emit(topic_or_room, data);
      }
    });

  }
}
sticky.listen(http, appPort); //Sticky sessions will create workers for us so no need to do fork!
