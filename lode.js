
require.paths.splice(0, require.paths.length - 1, __dirname + '/node_modules');

var Q = require("q");
var LINK = require("./lib/linkage");

exports.main = main;
function main() {
    var href = process.argv[2] || '';
    LINK.requireHref(href)
    .then(null, Q.error)
}

if (require.main === module)
    main();

