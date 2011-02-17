
var Q = require("q/util");
var PACKAGES = require("./lib/packages");

function main() {
    var script = process.argv[2] || '';
    var options = {
        "engines": [],
        "debug": false
    };
    var pkg = PACKAGES.loadPackageContaining(script, options);
    return Q.when(pkg, function (pkg) {
        var id = pkg.identify(script);
        return Q.when(id, pkg.require.exec || pkg.require);
    }).then(null, Q.error);
}

main();

