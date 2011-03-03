
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

