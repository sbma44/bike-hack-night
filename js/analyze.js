var PIXELS_PER_SECOND = 30.0;
var PIXELS_PER_CM = 2.5;
var MAX_DIST = 300;

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
        if (xhr.readyState>3 && xhr.status==200) success(xhr.responseText);
    };
    xhr.setRequestHeader('X-Requested-With', 'XMLHttpRequest');
    xhr.send();
    return xhr;
}

function setup(ajaxResponse) {
    var data = JSON.parse(ajaxResponse);

    MAX_DIST = data.reduce(function(prev, cur) { return Math.max(prev, Math.max(cur[1], cur[2])); }, 0);

    var canvas = document.createElement('canvas');
    canvas.id = 'main';
    canvas.height = Math.round(MAX_DIST * PIXELS_PER_CM);
    canvas.width = Math.abs(data[data.length - 1][0] - data[0][0]) * PIXELS_PER_SECOND;
    document.getElementById('container').appendChild(canvas);

    Array.prototype.slice.call(document.getElementsByTagName('input'), 0).concat(Array.prototype.slice.call(document.getElementsByTagName('select'), 0))
        .forEach(function(el) {
            addEvent(el, 'change', draw.bind(null, data));
        });

    draw(data);
}

function dist2y(dist) {
    return (MAX_DIST * PIXELS_PER_CM) - Math.round(dist * PIXELS_PER_CM);
}

function isChecked(n) {
    return document.getElementById(n) && document.getElementById(n).checked;
}

function draw(data) {

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
        console.log(BOXCAR_WIDTH);
        for(var i = Math.floor(BOXCAR_WIDTH / 2); i < data.length - Math.floor(BOXCAR_WIDTH / 2); i++) {
            for (var k = 1; k <= 2; k++) {
                var sum = 0;
                var total = 0;
                for(var j = -1 * Math.floor(BOXCAR_WIDTH / 2); j <= Math.floor(BOXCAR_WIDTH / 2); j++) {
                    if (data[i + j][k] !== null) {
                        sum += data[i + j][k];
                        total++;
                    }
                }

                if (data[i][k] !== null)
                    data[i][k] = sum / total;
            }
        }
    }


    // todo:
    // - highlight correlated sections

    var canvas = document.getElementById('main');
    var ctx = canvas.getContext('2d');
    ctx.lineCap = 'round';
    ctx.lineWidth = 3;

    ctx.fillStyle = 'black';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // draw passing distance
    ctx.beginPath();
    ctx.strokeStyle = 'red';
    ctx.setLineDash([5, 15]);
    ctx.moveTo(0, dist2y(91.44));
    ctx.lineTo(canvas.width, dist2y(91.44));
    ctx.stroke();
    ctx.setLineDash([10, 1]);




    ['white', '#0066ff'].forEach(function(sensorColor, sensor_i) {
        ctx.strokeStyle = ctx.fillStyle = sensorColor;

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

    var url = '/data/bd2-20160815-181115-sonar.json';
    getAjax(url, setup);
});