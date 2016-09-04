var http = require('http');
var fs = require('fs');
var path = require('path');
var WebSocketServer = require('ws').Server;

// websocket broadcast server
var wss = new WebSocketServer({ port: 8000 });
wss.on('connection', function connection(ws) {
  console.log('- websocket connection detected (' + wss.clients.length + ' total)');
  ws.on('error', function(e) { console.log('Got an error:', e); });
  ws.on('message', function incoming(message) {
    ws.esp8266 = true;
    wss.clients
      .filter(function(c) { return !c.esp8266; })
      .forEach(function(c, i) {
        c.send(message);
    });
  });
});
console.log('* websocket server started at 127.0.0.1:8000');

// http static server
http.createServer(function (request, response) {
    console.log('   ', request.url);

    var filePath = '.' + request.url;
    if (filePath == './')
        filePath = './index.html';

    var extname = path.extname(filePath);
    var contentType = 'text/html';
    switch (extname) {
        case '.js':
            contentType = 'text/javascript';
            break;
        case '.css':
            contentType = 'text/css';
            break;
        case '.json':
            contentType = 'application/json';
            break;
        case '.png':
            contentType = 'image/png';
            break;
        case '.jpg':
            contentType = 'image/jpg';
            break;
        case '.wav':
            contentType = 'audio/wav';
            break;
        case '.mp4':
            contentType = 'video/mp4';
            break;
        case '.otf':
            contentType = 'font/opentype';
            break;
    }

    filePath = filePath.replace(/\?.*$/, '');
    fs.readFile(filePath, function(error, content) {
        if (error) {
            if(error.code == 'ENOENT'){
                fs.readFile('./404.html', function(error, content) {
                    response.writeHead(200, { 'Content-Type': contentType });
                    response.end(content, 'utf-8');
                });
            }
            else {
                response.writeHead(500);
                response.end('Sorry, check with the site admin for error: '+error.code+' ..\n');
                response.end();
            }
        }
        else {
            response.writeHead(200, { 'Content-Type': contentType });
            response.end(content, 'utf-8');
        }
    });

}).listen(8080);

console.log('* static server running at 127.0.0.1:8080');