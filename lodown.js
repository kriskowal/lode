
var Q = require("q/util");
var PACKAGES = require("./lib/packages");

function main() {
    var path = process.argv[2] || '';
    var options = {
        "engines": [],
        "debug": false
    };
    var catalog = PACKAGES.linkPackage(path, options);
    return Q.when(catalog, function (catalog) {
        console.log(JSON.stringify(catalog, null, 4));
    }).then(null, Q.error);
}

main();
