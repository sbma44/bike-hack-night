var fs = require('fs');
var signal = require('../lib/signal');
var queue = require('d3-queue').queue;

var geo = JSON.parse(fs.readFileSync(process.argv[2] + '.geojson').toString());
var dist = JSON.parse(fs.readFileSync(process.argv[2] + '-sonar.json').toString());

// trim ends
var r = signal.trimTrip(dist, geo);
dist = r[0];
geo = r[1];

var speed = signal.calculateSpeed(geo);

// preserve original data
var originalData = JSON.parse(JSON.stringify(dist));

// correct zeros
dist = signal.zeroToMax(dist);

// smooth
dist = signal.boxcarSmooth(dist, 7, 1);
dist = signal.boxcarSmooth(dist, 7, 2);

var q = queue();
q.defer(signal.peaks, dist, 1, false);
q.defer(signal.peaks, dist, 2, false);
q.awaitAll(function(err, results) {
    var correlated = signal.correlate(results[0], results[1], 30, 2.5, 20);
    var correlatedPairs = correlated[0];

    var realData = signal.associateRealDataWithCorrelatedPairs(correlatedPairs, originalData);

    var features = [];
    correlatedPairs.forEach(function(pair, i) {
        var t = pair.map(function (x) { return x[0]; }).reduce(function(prev, cur) { return prev + cur; }, 0) / pair.length;

        var geo_i = 0;
        while ((geo.features[0].properties.timestamp[geo_i] < t) && (geo_i < geo.features[0].properties.timestamp.length))
            geo_i++;

        if (geo_i === 0)
            throw new Error('event timestamp precedes geodata');

        var geoPct = (t - geo.features[0].properties.timestamp[geo_i - 1]) / (geo.features[0].properties.timestamp[geo_i] - geo.features[0].properties.timestamp[geo_i - 1]);
        var interpolatedLon = geo.features[0].geometry.coordinates[geo_i - 1][0] + (geoPct * (geo.features[0].geometry.coordinates[geo_i][0] - geo.features[0].geometry.coordinates[geo_i - 1][0]));
        var interpolatedLat = geo.features[0].geometry.coordinates[geo_i - 1][1] + (geoPct * (geo.features[0].geometry.coordinates[geo_i][1] - geo.features[0].geometry.coordinates[geo_i - 1][1]));

        var speed_i = 0;
        while ((speed[speed_i][0] < t) && (speed_i < speed.length))
            speed_i++;

        if ((speed_i === 0) || (speed_i === speed.length - 1))
            throw new Error('couldn\'t find speeds to interpolate between');

        var speedPct = (t - speed[speed_i - 1][0]) / (speed[speed_i][0] - speed[speed_i - 1][0]);
        var featSpeed = speed[speed_i - 1][1] + (speedPct * ((speed[speed_i][1] - speed[speed_i - 1][1])));

        var feat = {
          "type": "Feature",
          "properties": {
            "distance": realData[i],
            "timestamp": t,
            "speed": featSpeed,
            "overtaken": pair[0][0] < pair[1][0],
            "overtook": pair[0][0] > pair[1][0]
          },
          "geometry": {
            "type": "Point",
            "coordinates": [ interpolatedLon, interpolatedLat ]
          }
        };

        if (feat.properties.overtaken)
            feat.properties['marker-color'] = '#aa0000';
        if (feat.properties.overtook)
            feat.properties['marker-color'] = '#00aa00';

        features.push(feat);
    });

    console.log(JSON.stringify({
        "type": "FeatureCollection",
        "features": features
    }, null, 2));
});