var PIXELS_PER_SECOND = 30.0;
var PIXELS_PER_CM = 2.5;
var MAX_DIST = 300;
var COLORS = [[255, 255, 255], [0, 102, 255]];

var queue = require('d3-queue').queue;
var dist = require('turf-distance');
var pt = require('turf-point');

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

function calculateSpeed(geoData) {
    var f = geoData.features[0];
    var out = [];
    var lastGoodPoint = 0;
    for(var i = 1; i < f.properties.timestamp.length; i++) {
        var t = (f.properties.timestamp[i] + f.properties.timestamp[lastGoodPoint]) / 2;
        var timespan = f.properties.timestamp[i] - f.properties.timestamp[lastGoodPoint];
        if (timespan < 0.5)
            continue;
        var distance = dist(pt(f.geometry.coordinates[i]), pt(f.geometry.coordinates[lastGoodPoint]), 'kilometers');
        out.push([t - f.properties.timestamp[0], distance / timespan]);
        lastGoodPoint = i;
    }

    // convert units from kilometers per sec to mph
    out = out.map(function(d) {
        d[1] = d[1] * 0.621371 * 3600;
        return d;
    });

    // apply smoothing
    out = boxcarSmooth(out, 5, 1);

    return out;
}

function boxcarSmooth(data, width, offset) {
    for(var i = Math.floor(width / 2); i < data.length - Math.floor(width / 2); i++) {
        var sum = 0;
        var total = 0;
        for(var j = -1 * Math.floor(width / 2); j <= Math.floor(width / 2); j++) {
            if (data[i + j][offset] !== null) {
                sum += data[i + j][offset];
                total++;
            }
        }

        if (data[i][offset] !== null)
            data[i][offset] = sum / total;
    }
    return data;
}

function setup(distanceData, geoData) {
    var data = JSON.parse(distanceData);
    var geo = JSON.parse(geoData);

    var speed = calculateSpeed(geo);

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
        data = data.map(function(d) {
            for(var i = 1; i <= 2; i++)
                d[i] = (d[i] === 0) ? MAX_DIST : d[i];
            return d;
        });
    }

    // filter mode
    if (isChecked('mode')) {
        var counts = data.reduce(function(prev, cur) {
            for(var i = 1; i <= 2; i++) {
                if (cur[i] === null) continue;
                if (!prev[cur[i]]) prev[cur[i]] = 0;
                prev[cur[i]]++;
            }
            return prev;
        }, {});
        var mode = parseInt(Object.keys(counts).reduce(function(prev, cur) {
            return (counts[cur] > counts[prev]) ? cur : prev;
        }, Object.keys(counts)[0]));

        data = data.map(function(d) {
            for(var i = 1; i <= 2; i++)
                d[i] = (d[i] === mode) ? null : d[i];
            return d;
        });
    }

    // remove blips
    if (isChecked('blip')) {
        for(var i = 0; i < data.length - 2; i++) {
            for(var j = 1; j <= 2; j++) {
                if ((data[i][j] === null) && (data[i+1][j]) && (data[i+2][j] === null))
                    data[i+1][j] = null;
            }
        }
    }

    // interpolate noise away
    if (isChecked('noise')) {
        for(var i = 0; i < data.length - 2; i++) {
            for(var j = 1; j <= 2; j++) {
                if ((data[i][j] === null) || (data[i+1][j] === null) || (data[i+2][j] === null))
                    continue;

                if ((Math.abs(data[i][j] - data[i+2][j]) < (0.05 * MAX_DIST)) &&
                    (Math.abs(data[i][j] - data[i+1][j]) > (0.05 * MAX_DIST)))
                    data[i+1][j] = (data[i][j] + data[i+2][j]) / 2.0;
            }
        }
    }

    // boxcar smoothing
    if (isChecked('boxcar')) {
        var BOXCAR_WIDTH = document.getElementById('boxcarWidth').options[document.getElementById('boxcarWidth').selectedIndex].value;
        data = boxcarSmooth(data, BOXCAR_WIDTH, 1);
        data = boxcarSmooth(data, BOXCAR_WIDTH, 2);
    }

    // todo:
    // - highlight correlated sections

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
    var derivative = data.reduce(function(prev, cur) { prev.push([cur[0], 0, 0]); return prev; }, []);
    for(var sensor_i = 0; sensor_i < COLORS.length; sensor_i++) {
        for(var i = 1; i < data.length; i++) {
            derivative[i][sensor_i + 1] = data[i][sensor_i + 1] - data[i - 1][sensor_i + 1];
        }
    }

    var derivative2 = data.reduce(function(prev, cur) { prev.push([cur[0], 0, 0]); return prev; }, []);
    for(var sensor_i = 0; sensor_i < COLORS.length; sensor_i++) {
        for(var i = 1; i < data.length; i++) {
            derivative2[i][sensor_i + 1] = derivative[i][sensor_i + 1] - derivative[i - 1][sensor_i + 1];
        }
    }

    if (isChecked('dy')) {
        COLORS.forEach(function(sensorColor, sensor_i) {
            ctx.beginPath();
            ctx.strokeStyle = 'rgba(' + sensorColor.join(',') + ',0.5)';
            ctx.moveTo(0, canvas.height);
            for(var i = 1; i < data.length; i++) {
                ctx.lineTo(data[i][0] * PIXELS_PER_SECOND, dist2y(derivative[i][sensor_i + 1]) - 100);
            }
            ctx.stroke();
        });
    }

    if (isChecked('dy2')) {
        COLORS.forEach(function(sensorColor, sensor_i) {
            ctx.beginPath();
            ctx.strokeStyle = 'rgba(' + sensorColor.join(',') + ',0.5)';
            ctx.moveTo(0, canvas.height);
            for(var i = 1; i < data.length; i++) {
                ctx.lineTo(data[i][0] * PIXELS_PER_SECOND, dist2y(derivative2[i][sensor_i + 1]) - 100);
            }
            ctx.stroke();
        });
    }

    if (isChecked('dy') || isChecked('dy2')) {
        ctx.beginPath();
        ctx.strokeStyle = 'yellow';
        ctx.moveTo(0, canvas.height - 100);
        ctx.lineTo(canvas.width, canvas.height - 100);
        ctx.stroke();
    }

    // draw passing distance
    ctx.beginPath();
    ctx.strokeStyle = 'red';
    ctx.setLineDash([5, 15]);
    ctx.moveTo(0, dist2y(91.44));
    ctx.lineTo(canvas.width, dist2y(91.44));
    ctx.stroke();
    ctx.setLineDash([10, 1]);

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