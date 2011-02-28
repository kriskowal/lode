
var Q = require("q/util");
var FS = require("q-fs");
var HTTP = require("q-http");
var PFS = require("./lib/fs");
var loadLinkage = require("./lib/linkage").loadLinkage;
var link = require("./lib/link").link;

function findIdForPath(linkage, path) {
    var lib = linkage.lib;
    var main = lib[""];
    if (main) {
        if (path === linkage.path)
            return "";
    }
    var keys = Object.keys(lib);
    for (var i = 0, ii = keys.length; i < ii; i++) {
        var id = keys[i];
        var module = lib[id];
        if (path === module.packagePath) {
            return id;
        }
    }
    throw new Error("Cannot find module for path " + JSON.stringify(path) + " in " + JSON.stringify(linkage.href));
}

function main() {
    var href = process.argv[2] || '';
    var got = PFS.get(href, {fs: FS, http: HTTP});
    return Q.when(got, function (got) {
        var options = {
            "engines": ["lode", "node"],
            "debug": true,
            "fs": got.fs,
            "http": HTTP,
            "path": got.path,
            "href": got.href
        };
        return Q.when(loadLinkage(got.path, options), function (linkage) {
            console.log(JSON.stringify(linkage, function (key, value) {
                if (key == "fs")
                    return;
                else
                    return value;
            }, 4));
        });
    })
    .then(null, Q.error)
}

main();

