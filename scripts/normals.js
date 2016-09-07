var fs = require('fs');
var path = require('path');
var turf = require('turf');

out = []

fs.readdirSync(process.argv[2])
    .filter(function(fn) { return fn.split('-')[0] === 'bd2'; })
    .forEach(function(fn) {
        j = JSON.parse(fs.readFileSync(path.normalize(process.argv[2] + '/' + fn)));
        src = JSON.parse(fs.readFileSync(__dirname + '/../data/' + fn.replace('-events', '')));

        j.features
            .filter(function(feat) { return feat.properties.distance !== undefined; })
            .forEach(function(feat) {
                var dist = turf.lineDistance(turf.lineSlice(src.features[0].geometry.coordinates[0], feat.geometry.coordinates, src.features[0]));

                // get points 50m before & after
                var before = turf.along(src.features[0], dist - 0.01, 'kilometers');
                var after = turf.along(src.features[0], dist + 0.01, 'kilometers');

                var dx = after.geometry.coordinates[0] - before.geometry.coordinates[0];
                var dy = after.geometry.coordinates[1] - before.geometry.coordinates[1];

                var normal = JSON.parse(JSON.stringify(feat));
                normal.geometry.coordinates[0] += dy;
                normal.geometry.coordinates[1] += dx;
                var normalLine = {
                    type: 'Feature',
                    geometry: {
                        type: 'LineString',
                        coordinates: [
                            feat.geometry.coordinates,
                            normal.geometry.coordinates
                        ]
                    },
                    properties: {}
                };

                var normalPoint = turf.along(normalLine, feat.properties.distance / 100000, 'kilometers');

                out.push({
                    type: 'Feature',
                    geometry: {
                        type: 'LineString',
                        coordinates: [
                            feat.geometry.coordinates,
                            normalPoint.geometry.coordinates
                        ]
                    },
                    properties: {}
                });

                out.push(feat);
            });
    });

console.log(JSON.stringify({
    type: 'FeatureCollection',
    features: out
}));