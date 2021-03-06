
require.paths.splice(0, require.paths.length - 1, __dirname + '/node_modules');

var Q = require("q/util");
var FS = require("q-fs");
var HTTP = require("q-http");
var PFS = require("./lib/fs");
var LINK = require("./lib/linkage");

exports.main = main;
function main() {
    var href = process.argv[2] || '';
    var engines = process.argv.slice(3);
    var got = PFS.get(href, {"fs": FS, "http": HTTP});
    return Q.when(got, function (got) {
        var options = {
            "engines": engines.length ? engines : ["lode", "node"],
            "debug": true,
            "fs": got.fs,
            "http": HTTP,
            "path": got.path,
            "href": got.href
        };
        return Q.when(LINK.loadLinkage(got.path, options), function (linkage) {
            return Q.when(LINK.read(linkage), function () {
                return Q.when(LINK.hash(linkage), function () {
                    console.log(JSON.stringify(linkage, function (key, value) {
                        if (["fs", "content", "javascript"].indexOf(key) >= 0)
                            return;
                        else
                            return value;
                    }, 4));
                });
            });

        });
    })
    .then(null, Q.error)
}

