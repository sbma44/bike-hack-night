var dist = require('turf-distance');
var pt = require('turf-point');

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
module.exports.boxcarSmooth = boxcarSmooth;

module.exports.calculateSpeed = function(geoData, smoothing) {
    smoothing = smoothing || 5;

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
};

module.exports.zeroToMax = function(data, max_dist) {
    if (!max_dist)
        max_dist = data.reduce(function(prev, cur) { return Math.max(prev, Math.max(cur[1], cur[2])); }, 0);
    return data.map(function(d) {
        for(var i = 1; i <= 2; i++)
            d[i] = (d[i] === 0) ? max_dist : d[i];
        return d;
    });
};

module.exports.derivative = function(data) {
    var derivative = data.reduce(function(prev, cur) { prev.push([cur[0], 0, 0]); return prev; }, []);
    for(var sensor_i = 0; sensor_i < 2; sensor_i++) {
        for(var i = 1; i < data.length; i++) {
            derivative[i][sensor_i + 1] = data[i][sensor_i + 1] - data[i - 1][sensor_i + 1];
        }
    }
    return derivative;
};

module.exports.highPassFilter = function(data) {
    var dMedian = derivative.map(function(x) { return x[1]; })
                    .concat(data.map(function(x) { return x[2]; }))
                    .map(Math.abs);
    dMedian.sort();
    dMedian = dMedian[Math.floor(dMedian.length / 2)];
    data = data.map(function(x) {
        x[1] = Math.abs(x[1] / dMedian) > 0.5 ? x[1] : 0;
        x[2] = Math.abs(x[2] / dMedian) > 0.5 ? x[2] : 0;
        return x;
    });
    return data;
}