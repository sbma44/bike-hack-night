set -eu
for f in js/*.js; do
    browserify -o dist/$(basename $f .js)-dist.js $f
done