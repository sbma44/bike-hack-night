var fs = require('fs');

var j = JSON.parse(fs.readFileSync(process.argv[2]).toString());

function isNumeric(n) {
  return !isNaN(parseFloat(n)) && isFinite(n);
}

var overtaken = j.features
    .filter(function(f) { return f.properties.overtaken; });
var overtook = j.features
    .filter(function(f) { return f.properties.overtook; });


console.log('--- total (n=' + j.features.length + ') ---');
console.log('avg dist:', (j.features.map(function(f) { return f.properties.distance; }).filter(isNumeric).reduce(function(prev, cur) { return prev + cur; }) * 0.0328084 / j.features.length).toFixed(1), 'ft');
console.log('speed   :', (j.features.map(function(f) { return f.properties.speed; }).filter(isNumeric).reduce(function(prev, cur) { return prev + cur; }) / j.features.length).toFixed(1), 'mph');
console.log('close   :', (j.features.filter(function(f) { return isNumeric(f.properties.distance) && (f.properties.distance * 0.0328084 < 3 ); }).length));
console.log();

console.log('--- when overtaken (n=' + overtaken.length + ') ---');
console.log('avg dist:', (overtaken.map(function(f) { return f.properties.distance; }).filter(isNumeric).reduce(function(prev, cur) { return prev + cur; }) * 0.0328084 / overtaken.length).toFixed(1), 'ft');
console.log('speed   :', (overtaken.map(function(f) { return f.properties.speed; }).filter(isNumeric).reduce(function(prev, cur) { return prev + cur; }) / overtaken.length).toFixed(1), 'mph');
console.log('close   :', (overtaken.filter(function(f) { return isNumeric(f.properties.distance) && (f.properties.distance * 0.0328084 < 3 ); }).length));

console.log();

console.log('--- when overtaking (n=' + overtook.length + ') ---');
console.log('avg dist:', (overtook.map(function(f) { return f.properties.distance; }).filter(isNumeric).reduce(function(prev, cur) { return prev + cur; }) * 0.0328084 / overtook.length).toFixed(1), 'ft');
console.log('speed   :', (overtook.map(function(f) { return f.properties.speed; }).filter(isNumeric).reduce(function(prev, cur) { return prev + cur; }) / overtook.length).toFixed(1), 'mph');
console.log('close   :', (overtook.filter(function(f) { return isNumeric(f.properties.distance) && (f.properties.distance * 0.0328084 < 3 ); }).length));
