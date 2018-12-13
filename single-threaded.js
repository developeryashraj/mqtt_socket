let mosca = require('mosca');
var express = require('express');
var app = express();
let http = require('http').Server(app);
let io = require('socket.io')(http);
let bodyParser = require('body-parser');
var appPort = 5000;
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));

let config = {
    "mqtt": {
        "port": 1883,
        "http_port": 1884
    }
};

//create connection settings for MQTT
let settings = {
    port: config.mqtt.port,
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

app.use(function(request, response, next) {
  response.header("Access-Control-Allow-Origin", "*");
  response.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept, api-key,udid,device-type,Authorization");
  next();
});

//Api endpoint for socket
app.get("/socket_mqtt_notification/:client_code", async function (req, res) {
  if (req.params.client_code) {
    //res.send({ error: "" });
    let postData = { "method": "take_update" };

    let mqttORsocket = {
      mqtt : 0,
      socket : 0
    }
    
    // decide whether to publish on socket.io or to mqtt or on both
    if(req.params.client_code == 111){
      mqttORsocket.socket = 1;
    } else if(req.params.client_code == 222){
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
    //console.log(postData);
    res.send({ error: "" });
  } else {
    res.send({ error: "invalid code" });
  }
  //return;
});

io.on('connection', function (socket) { //connect socket event is here
  // console.log("socket",socket.handshake.query.token);
  if(socket.handshake.query.token !== undefined){
    socket.join(socket.handshake.query.token);
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
    console.log("mqtt publish");
    mqttServer.publish(message, function () {
        // console.log('publish done!',message);
    });
};

let SocketPublishIO = function (topic_or_room, data) {
  console.log("socket publish");
  if (io.sockets.adapter.rooms[topic_or_room]) {
    // console.log("Emitting to socket room ",topic_or_room);
    io.to(topic_or_room).emit(topic_or_room, data);
  } else {
    // console.log("Emitting without room ",topic_or_room);
    io.emit(topic_or_room, data);
  }
}

http.listen(appPort, function() {
  console.log('App listening on port ' + appPort);
});