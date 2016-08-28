var SECONDS_ACROSS = 5.0;
var PIXELS_PER_CM = 1;
var MAX_CM = 200;
var ctx, canvas;

var lastPoint = null;

function draw(msg) {

    var dist = parseInt(msg.split('/')[1]);
    if (dist === 0) dist = MAX_CM;

    var x = Math.round(canvas.width * ((parseInt(msg.split('/')[0]) / 1000.0) % SECONDS_ACROSS) / SECONDS_ACROSS);
    var y = canvas.height - (MAX_CM * PIXELS_PER_CM * 0.5) - (PIXELS_PER_CM * dist);

    if (lastPoint) {
        if (lastPoint[0] > x) {
            lastPoint[0] = 0;
            ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
        }

        ctx.beginPath();
        ctx.moveTo(lastPoint[0], lastPoint[1]);
        ctx.lineTo(x, y);
        ctx.stroke();
    }

    lastPoint = [x, y];
}

function ready() {
    canvas = document.createElement('canvas');
    canvas.width = parseInt(location.href.split('?')[1].split('|')[0]);
    canvas.height = parseInt(location.href.split('?')[1].split('|')[1]);;
    document.getElementById('container').appendChild(canvas);
    ctx = canvas.getContext('2d');
    ctx.strokeStyle = 'red';
    ctx.lineWidth = 10;
    ctx.lineCap = 'round';

    var sock = new WebSocket("ws://127.0.0.1:8000/");
    sock.onmessage = function (event) {
        if (event.data.indexOf('RANGE:') !== -1)
            MAX_CM = parseInt(event.data.split(':')[1]);
        else
            draw(event.data);
    }
}

document.addEventListener('DOMContentLoaded', ready);
