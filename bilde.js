
require.paths.splice(0, require.paths.length - 1, __dirname + '/node_modules');

var Q = require("q/util");
var FS = require("q-fs");
var HTTP = require("q-http");
var PFS = require("./lib/fs");
var LINK = require("./lib/linkage");
var UGLIFY = require("./lib/uglify");

exports.main = main;
function main() {
    var href = process.argv[2] || '';
    var got = PFS.get(href, {fs: FS, http: HTTP});
    var loader = FS.read("client/lode.js", "r", "utf-8");
    Q.when(got, function (got) {
        var options = LINK.defaultOptions();
        options.engines = ['lode', 'browser'];
        return Q.when(LINK.loadLinkage(got.path, options), function (linkage) {
            LINK.read(linkage);
            return Q.when(LINK.compile(linkage, options), function () {
                var body = Q.when(LINK.hash(linkage), function () {
                    var packages = linkage.packages;
                    var packagesText = "{" + Object.keys(packages).map(function (href) {
                        var pkg = packages[href];
                        var lib = pkg.lib;
                        var dependencies = Object.keys(pkg.mappings).map(function (mapping) {
                            return packages[pkg.mappings[mapping].href].hash;
                        });
                        var lib = "{" + Object.keys(lib).map(function (id) {
                            var module = lib[id];
                            if (module.javascript) {
                                var names = ["require", "exports", "module", "define", "pkg", "console"];
                                return JSON.stringify(id)  + ": function (" + names.join(", ") + ") {" + module.javascript + "\n}";
                            } else if (module.reference) {
                                return JSON.stringify(id) + ": " + JSON.stringify({
                                    "id": module.id,
                                    "pkg": packages[module.package].hash
                                });
                            } else if (module.capability) {
                                throw new Error("Capabilities not yet supported");
                            } else {
                                throw new Error("Module type unrecognized " + JSON.stringify(Object.keys(module)));
                            }
                        }).join(", ") + "}";
                        return "" + JSON.stringify(pkg.hash) + ": {d:" + JSON.stringify(dependencies) + ", l:" + lib + "}";
                    }).join(",") + "}";
                    var linkageText = "{m: " + JSON.stringify(packages[linkage.main].hash) + ", p:" + packagesText + "}";
                    return "(this, " + linkageText + ")";
                });
                return Q.join([
                    body,
                    loader
                ], function (body, loader) {
                    body = loader + body;
                    //body = UGLIFY.uglify(body);
                    var main = linkage.packages[linkage.main];
                    var name = "www/" + main.hash + ".js";
                    console.log(name);
                    var index = '<script src="' + main.hash + '.js"></script>';
                    return Q.join([
                        FS.write("www/index.html", index, "w", "utf-8"),
                        FS.write(name, body, "w", "utf-8")
                    ]);
                })
            });
        });
    })
    .then(null, Q.error)
        
}

