var PIXELS_PER_SECOND = 30.0;
var PIXELS_PER_CM = 2.5;
var MAX_DIST = 300;
var DX_HEIGHT = 300;
var COLORS = [[255, 255, 255], [0, 102, 255]];
var OVERLAP_THRESHOLD = 20;

var queue = require('d3-queue').queue;
var signal = require('../lib/signal');

function dist2y(dist) {
    return (MAX_DIST * PIXELS_PER_CM) - Math.round(dist * PIXELS_PER_CM);
}

function isChecked(n) {
    return document.getElementById(n) && document.getElementById(n).checked;
}

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

    MAX_DIST = data.reduce(function(prev, cur) { return Math.max(prev, Math.max(cur[1], cur[2])); }, 0);

    var canvas = document.createElement('canvas');
    canvas.id = 'main';
    canvas.height = Math.round(MAX_DIST * PIXELS_PER_CM);
    canvas.width = Math.abs(data[data.length - 1][0] - data[0][0]) * PIXELS_PER_SECOND;
    document.getElementById('container').appendChild(canvas);

    Array.prototype.slice.call(document.getElementsByTagName('input'), 0).concat(Array.prototype.slice.call(document.getElementsByTagName('select'), 0))
        .forEach(function(el) {
            addEvent(el, 'change', draw.bind(null, data, geo));
        });

    draw(data, geo);
}

function draw(data, geo) {

    // make copies
    data = JSON.parse(JSON.stringify(data));
    geo = JSON.parse(JSON.stringify(geo));

    // trim start and end, if desired
    if (isChecked('trim')) {
        var r = signal.trimTrip(data, geo);
        data = r[0];
        geo = r[1];
    }

    // set initial t = 0
    var base = data[0][0];
    data = data.map(function(d) {
        d[0] = d[0] - base;
        d = d.map(parseFloat);
        return d;
    });

    // calculate speed
    var speed = signal.calculateSpeed(geo);
    // make speed timestamps relative to t = 0
    speed = speed.map(function(s) {
        s[0] = s[0] - geo.features[0].properties.timestamp[0];
        return s;
    });

    // keep the data around
    var originalData = JSON.parse(JSON.stringify(data));

    // calculate sampling rate
    var sonarHz = originalData.length / (originalData[originalData.length - 1][0] - originalData[0][0]);
    var geoHz = geo.features[0].properties.timestamp.length / (geo.features[0].properties.timestamp[geo.features[0].properties.timestamp.length - 1] - geo.features[0].properties.timestamp[0]);
    document.getElementById('hz').innerText = sonarHz.toFixed(1) + ' Hz (sonar) / ' + geoHz.toFixed(1) + ' Hz (geo)';

    // basic canvas setup
    var canvas = document.getElementById('main');
    var ctx = canvas.getContext('2d');
    ctx.font = "12px helvetica";
    ctx.lineCap = 'round';
    ctx.lineWidth = 3;

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

    // blank canvas
    ctx.fillStyle = 'black';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // draw speed
    if (isChecked('speed')) {
        var maxSpeed = 40; //speed.reduce(function(prev, cur) { return Math.max(prev, cur[1]) }, 0);
        ctx.fillStyle = '#444';
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

    if (isChecked('peaks')) {
        var q = queue();
        q.defer(signal.peaks, data, 1, MAX_DIST);
        q.defer(signal.peaks, data, 2, MAX_DIST);
        q.awaitAll(function(err, results) {
            if (err) return console.error(err);

            function drawCircle(x, y, color) {
                ctx.strokeStyle = color;
                ctx.beginPath();
                ctx.arc(x * PIXELS_PER_SECOND, dist2y(y), OVERLAP_THRESHOLD / 2, 0, Math.PI*2, true);
                ctx.stroke();
            }

            ctx.lineWidth = 2;
            var correlatedPairs, unmatchedA, unmatchedB;
            if (isChecked('correlate')) {
                function pixelMult(x) { return [PIXELS_PER_SECOND * x[0], PIXELS_PER_CM * x[1]]; }

                var correlated = signal.correlate(results[0], results[1], PIXELS_PER_SECOND, PIXELS_PER_CM, OVERLAP_THRESHOLD);

                correlatedPairs = correlated[0];
                unmatchedA = correlated[1];
                unmatchedB = correlated[2];

                var realData = signal.associateRealDataWithCorrelatedPairs(correlatedPairs, originalData);

                unmatchedA.forEach(function(pt) {
                    drawCircle(pt[0], pt[1], 'rgba(' + COLORS[0].join(',') + ',1.0)');
                });
                unmatchedB.forEach(function(pt) {
                    drawCircle(pt[0], pt[1], 'rgba(' + COLORS[1].join(',') + ',1.0)');
                });
                correlatedPairs.forEach(function(pair, i) {
                    pair.forEach(function(pt) {
                        drawCircle(pt[0], pt[1], 'rgba(50, 255, 50, 1)');
                    });

                    var avgX = PIXELS_PER_SECOND * (pair[0][0] + pair[1][0]) * 0.5;
                    var avgY = dist2y(realData[i]);

                    ctx.strokeStyle = 'yellow';
                    ctx.beginPath();
                    ctx.moveTo(avgX - 25, avgY);
                    ctx.lineTo(avgX + 25, avgY);
                    ctx.stroke();

                    ctx.fillStyle = 'yellow';
                    ctx.fillText((realData[i] * 0.0328084).toFixed(2) + ' ft', avgX + 30, avgY + 5);
                });
            }
            else {
                results.forEach(function(r, i) {
                    r.forEach(function(pt) {
                        drawCircle(pt[0], pt[1], 'rgba(' + COLORS[i].join(',') + ',1.0)');
                    });
                });
            }
            ctx.lineWidth = 3;
        });
    }

    // draw legal passing distance
    ctx.beginPath();
    ctx.strokeStyle = 'red';
    ctx.setLineDash([5, 15]);
    ctx.moveTo(0, dist2y(91.44));
    ctx.lineTo(canvas.width, dist2y(91.44));
    ctx.stroke();
    ctx.setLineDash([]);

    // draw data - accounts for gappy data, which no longer exists
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