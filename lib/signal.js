var dist = require('turf-distance');
var pt = require('turf-point');
var slayer = require('slayer')({ minPeakDistance: 5 });
var queue = require('d3-queue').queue;

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
        out.push([t, distance / timespan]);
        lastGoodPoint = i;
    }

    // convert units from kilometers per sec to mph
    out = out.map(function(d) {
        d[1] = d[1] * 0.621371 * 3600;
        return d;
    });

    // apply smoothing
    if (smoothing > 1)
        out = boxcarSmooth(out, smoothing, 1);

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

module.exports.peaks = function(data, offset, maxDist, callback) {
    if (!maxDist)
        maxDist = data.reduce(function(prev, cur) { return Math.max(prev, Math.max(cur[1], cur[2])); }, 0);

    // ugh whyyyyy u make this async
    slayer
        .x(function(item) {
            return item[0];
        })
        .y(function(item) {
            return maxDist - item[offset];
        })
        .fromArray(data, function(err, spikes) {
            var out = [];
            if (err) return cb(err);
            spikes.forEach(function(spike) {
                out.push([spike.x, maxDist - spike.y]);
            });
            callback(err, out);
        });
};

module.exports.correlate = function(peaks1, peaks2, xFactor, yFactor, threshold) {
    var pairs = [];
    for(var i = 0; i < peaks1.length; i++) {
        for(var j = 0; j < peaks2.length; j++) {
            if(!peaks2[j].assigned) {
                var dx = xFactor * (peaks1[i][0] - peaks2[j][0]);
                var dy = yFactor * (peaks1[i][1] - peaks2[j][1]);
                if (Math.sqrt((dx * dx) + (dy * dy)) < threshold) {
                    peaks1[i].assigned = true;
                    peaks2[j].assigned = true;
                    pairs.push([peaks1[i], peaks2[j]]);
                }
            }
        }
    }

    function unassigned(x) { return !x.assigned; }

    return [pairs, peaks1.filter(unassigned), peaks2.filter(unassigned)];
};

module.exports.associateRealDataWithCorrelatedPairs = function(pairs, realData) {
    realDataCopy = JSON.parse(JSON.stringify(realData));
    pairsCopy = JSON.parse(JSON.stringify(pairs));
    var out = [ [] ];

    while((realDataCopy.length > 0) && (pairsCopy.length > 0)) {
        var thisTime = realDataCopy.shift();

        if (thisTime[0] === pairsCopy[0][0][0]) {
            out[out.length - 1].push(thisTime[1]);
            pairsCopy[0][0][0] = null;
        }
        if (thisTime[0] === pairsCopy[0][1][0]) {
            out[out.length - 1].push(thisTime[2]);
            pairsCopy[0][1][0] = null;
        }

        if ((pairsCopy[0][0][0] === null) && (pairsCopy[0][1][0] === null)) {
            out.push([]);
            pairsCopy.shift();
        }
    }

    out = out
        .filter(function(x) { return x.length > 0; })
        .map(function(x) {
            return x.reduce(function(prev, cur) { return prev + cur; }, 0) / x.length;
        });

    return out;
};

module.exports.trimTrip = function(data, geoData, distanceThreshold) {
    var feat = geoData.features[0];
    distanceThreshold = distanceThreshold || 0.2; // km

    var first = pt(feat.geometry.coordinates[0]);
    var last = pt(feat.geometry.coordinates[feat.geometry.coordinates.length - 1]);

    var i = 0;
    while((i < feat.geometry.coordinates.length) && (dist(first, pt(feat.geometry.coordinates[i], 'kilometers')) < distanceThreshold))
        i++;

    var j = feat.geometry.coordinates.length - 1;
    while((j >= 0) && (dist(last, pt(feat.geometry.coordinates[j], 'kilometers')) < distanceThreshold))
        j--;

    var outData = data.filter(function(d) { return d[0] >= feat.properties.timestamp[i] && d[0] <= feat.properties.timestamp[j]; });
    var outGeoData = JSON.parse(JSON.stringify(geoData));

    outGeoData.features[0].properties.timestamp = outGeoData.features[0].properties.timestamp.slice(i, j+1);
    outGeoData.features[0].geometry.coordinates = outGeoData.features[0].geometry.coordinates.slice(i, j+1);
    return [outData, outGeoData];
}

