var PIXELS_PER_SECOND = 30.0;
var PIXELS_PER_CM = 2.5;
var MAX_DIST = 300;
var DX_HEIGHT = 300;
var COLORS = [[255, 255, 255], [0, 102, 255]];

var queue = require('d3-queue').queue;
var signal = require('../lib/signal');

function addEvent(el, type, handler) {
    if (el.attachEvent) el.attachEvent('on'+type, handler); else el.addEventListener(type, handler);
}

function removeEvent(el, type, handler) {
    if (el.detachEvent) el.detachEvent('on'+type, handler); else el.removeEventListener(type, handler);
}

function getAjax(url, success) {
    console.log('loading', url);
    var xhr = window.XMLHttpRequest ? new XMLHttpRequest() : new ActiveXObject('Microsoft.XMLHTTP');
    xhr.open('GET', url);
    xhr.onreadystatechange = function() {
        if (xhr.readyState>3 && xhr.status==200) success(null, xhr.responseText);
    };
    xhr.setRequestHeader('X-Requested-With', 'XMLHttpRequest');
    xhr.send();
    return xhr;
}

function setup(distanceData, geoData) {
    var data = JSON.parse(distanceData);
    var geo = JSON.parse(geoData);

    var speed = signal.calculateSpeed(geo);

    MAX_DIST = data.reduce(function(prev, cur) { return Math.max(prev, Math.max(cur[1], cur[2])); }, 0);

    var canvas = document.createElement('canvas');
    canvas.id = 'main';
    canvas.height = Math.round(MAX_DIST * PIXELS_PER_CM);
    canvas.width = Math.abs(data[data.length - 1][0] - data[0][0]) * PIXELS_PER_SECOND;
    document.getElementById('container').appendChild(canvas);

    Array.prototype.slice.call(document.getElementsByTagName('input'), 0).concat(Array.prototype.slice.call(document.getElementsByTagName('select'), 0))
        .forEach(function(el) {
            addEvent(el, 'change', draw.bind(null, data, speed));
        });

    draw(data, speed);
}

function dist2y(dist) {
    return (MAX_DIST * PIXELS_PER_CM) - Math.round(dist * PIXELS_PER_CM);
}

function isChecked(n) {
    return document.getElementById(n) && document.getElementById(n).checked;
}

function draw(data, speed) {

    // set initial t = 0
    var base = data[0][0];
    data = data.map(function(d) {
        d[0] = d[0] - base;
        d = d.map(parseFloat);
        return d;
    });

    // change zero => max
    if (isChecked('zero')) {
        data = signal.zeroToMax(data, MAX_DIST);
    }

    // boxcar smoothing
    if (isChecked('boxcar')) {
        var BOXCAR_WIDTH = document.getElementById('boxcarWidth').options[document.getElementById('boxcarWidth').selectedIndex].value;
        data = signal.boxcarSmooth(data, BOXCAR_WIDTH, 1);
        data = signal.boxcarSmooth(data, BOXCAR_WIDTH, 2);
    }


    var canvas = document.getElementById('main');
    var ctx = canvas.getContext('2d');
    ctx.lineCap = 'round';
    ctx.lineWidth = 3;

    ctx.fillStyle = 'black';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // draw speed
    if (isChecked('speed')) {
        var maxSpeed = 40; //speed.reduce(function(prev, cur) { return Math.max(prev, cur[1]) }, 0);
        ctx.fillStyle = '#222';
        ctx.beginPath();
        ctx.moveTo(0, canvas.height - (canvas.height * speed[0][1] / maxSpeed));
        speed.forEach(function(s) {
            ctx.lineTo(s[0] * PIXELS_PER_SECOND, canvas.height - (canvas.height * s[1] / maxSpeed));
        });
        ctx.lineTo(canvas.width, canvas.height - (canvas.height * speed[speed.length - 1][1] / maxSpeed));
        ctx.lineTo(canvas.width, canvas.height);
        ctx.lineTo(0, canvas.height);
        ctx.fill();
    }

    // derivatives
    var derivative = signal.derivative(data);
    var derivative2 = signal.derivative(derivative);

    if (isChecked('highpass') && (isChecked('dy') || isChecked('dy2'))) {
        derivative = signal.highPassFilter(derivative);
        derivative2 = signal.highPassFilter(derivative2);
    }

    if (isChecked('dy') || isChecked('dy2')) {
        var dCanvas = document.getElementById('dCanvas');
        if (!dCanvas) {
            var dCanvas = document.createElement('canvas');
            dCanvas.id = 'dCanvas';
            dCanvas.width = Math.abs(data[data.length - 1][0] - data[0][0]) * PIXELS_PER_SECOND;
            dCanvas.height = 400;
            document.getElementById('container').appendChild(dCanvas);
        }

        var derivativeToUse = isChecked('dy') ? derivative : derivative2;

        var maxDerivValue = derivativeToUse.reduce(function(prev, cur) { return Math.max(Math.abs(cur[2]), Math.max(Math.abs(cur[1]), prev)); }, 0);
        var maxDerivValue = 40;

        var dctx = dCanvas.getContext('2d');
        dctx.lineWidth = 3;
        dctx.lineCap = 'round';
        dctx.fillStyle = 'black';
        dctx.fillRect(0, 0, dCanvas.width, dCanvas.height);
        COLORS.forEach(function(sensorColor, sensor_i) {
            dctx.beginPath();
            dctx.strokeStyle = 'rgba(' + sensorColor.join(',') + ',1)';
            dctx.moveTo(0, dCanvas.height / 2);
            for(var i = 1; i < data.length; i++) {
                dctx.lineTo(data[i][0] * PIXELS_PER_SECOND, ((derivativeToUse[i][sensor_i + 1] / maxDerivValue) + 1) * dCanvas.height * 0.5);
            }
            dctx.stroke();
        });
        dctx.strokeStyle = 'rgba(255, 255, 0, 0.5)';
        dctx.beginPath();
        dctx.moveTo(0, dCanvas.height / 2);
        dctx.lineTo(dCanvas.width, dCanvas.height / 2);
        dctx.stroke();
    }
    else {
        var dCanvas = document.getElementById('dCanvas');
        if (dCanvas) dCanvas.parentNode.removeChild(dCanvas);
    }

    // plot peaks
    var peaks = [[], []];
    if (isChecked('peaks')) {
        var dctx = null;
        var dCanvas = document.getElementById('dCanvas');
        if (dCanvas) dctx = dCanvas.getContext('2d');

        ctx.lineWidth = 1;
        var derivativeToUse = derivative;
        for(var i = 0; i < derivativeToUse.length - 1; i++) {
            for(var sensor_i = 1; sensor_i <= 2; sensor_i++) {
                if ((derivativeToUse[i][sensor_i] < 0) && (derivativeToUse[i + 1][sensor_i] >= 0)) {
                    ctx.beginPath();
                    ctx.strokeStyle = 'rgba(' + COLORS[sensor_i - 1].join(',') + ',0.5)';
                    ctx.moveTo(derivativeToUse[i][0] * PIXELS_PER_SECOND, 0);
                    ctx.lineTo(derivativeToUse[i][0] * PIXELS_PER_SECOND, canvas.height);
                    ctx.stroke();

                    peaks[sensor_i - 1].push(i);

                    if (dctx && dCanvas) {
                        dctx.beginPath();
                        dctx.lineWidth = 1;
                        dctx.strokeStyle = 'rgba(' + COLORS[sensor_i - 1].join(',') + ',0.5)';
                        dctx.moveTo(derivativeToUse[i][0] * PIXELS_PER_SECOND, 0);
                        dctx.lineTo(derivativeToUse[i][0] * PIXELS_PER_SECOND, dCanvas.height);
                        dctx.stroke();
                    }
                }
            }
        }
        ctx.lineWidth = 3;
    }

    if (isChecked('correlate')) {
        var correlated = [[], []];
        for(var i = 0; i < peaks[0].length; i++) {
            var thisPeak = peaks[0][i];

            var before = peaks[1].filter(function(p) { return p <= thisPeak; }).pop();
            var after = peaks[1].filter(function(p) { return p >= thisPeak; })[0];

            if (before !== undefined && after !== undefined) {
                var correlatedPeak = (data[thisPeak][0] - data[before][0]) <= (data[after][0] - data[thisPeak][0]) ? before : after;

                var timespan = Math.abs(data[correlatedPeak][0] - data[thisPeak][0]);
                if (timespan < 2.0) {
                    if (!isChecked('onepointfive') || ((data[thisPeak][1] < 150) && (data[correlatedPeak][2] < 150)))
                    if (Math.abs(data[thisPeak][1] - data[correlatedPeak][2]) < 10) {
                        ctx.fillStyle = 'rgba(0, 255, 0, 0.5)';
                        ctx.fillRect(data[thisPeak][0] * PIXELS_PER_SECOND, 0, timespan * PIXELS_PER_SECOND, canvas.height);
                    }
                }
            }
        }
    }

    // draw legal passing distance
    ctx.beginPath();
    ctx.strokeStyle = 'red';
    ctx.setLineDash([5, 15]);
    ctx.moveTo(0, dist2y(91.44));
    ctx.lineTo(canvas.width, dist2y(91.44));
    ctx.stroke();
    ctx.setLineDash([]);

    // draw data
    COLORS.forEach(function(sensorColor, sensor_i) {
        ctx.strokeStyle = ctx.fillStyle = 'rgba(' + sensorColor.join(',') + ',1.0)';

        var drawing = false;
        for(var pt_i = 0; pt_i < data.length; pt_i++) {
            if(data[pt_i][sensor_i + 1] !== null) {
                if(!drawing) {
                    ctx.beginPath();
                    ctx.moveTo(Math.round(data[pt_i][0] * PIXELS_PER_SECOND), dist2y(data[pt_i][sensor_i + 1]))
                    drawing = true;
                }
                ctx.lineTo(Math.round(data[pt_i][0] * PIXELS_PER_SECOND), dist2y(data[pt_i][sensor_i + 1]));
            }
            else {
                if(drawing) {
                    ctx.stroke();
                    drawing = false;
                }
            }
        }

        if (drawing)
            ctx.stroke();
    });
}

document.addEventListener('DOMContentLoaded', function() {
    console.log('starting');

    var url = '/data/bd2-20160815-181115';

    var q = queue();
    q.defer(getAjax, url + '-sonar.json');
    q.defer(getAjax, url + '.geojson');
    q.awaitAll(function(err, results) {
        if (err) return console.error(err);
        setup.apply(null, results);
    });
});