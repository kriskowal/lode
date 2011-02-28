
var Q = require("q/util");
var FS = require("q-fs");
var HTTP = require("q-http");
var PFS = require("./lib/fs");
var loadLinkage = require("./lib/linkage").loadLinkage;
var link = require("./lib/link").link;

// in a given file system, finds the package that contains the given path
function findPackage(path, fs) {
    var file = fs.open(fs.join(path, "package.json"));
    return Q.when(file, function (file) {
        return {
            "path": path,
            "file": file
        };
    }, function (reason) {
        var next = fs.directory(path);
        if (next === path) {
            return Q.reject("Package not found.");
        } else {
            return findPackage(next, fs);
        }
    });
}

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
        return Q.when(findPackage(got.path, got.fs), function (found) {
            var options = {
                "engines": ["lode", "node"],
                "debug": true,
                "fs": got.fs,
                "http": HTTP,
                "path": got.path,
                "href": got.href
            };
            return Q.when(loadLinkage(found.path, options), function (linkage) {
                return Q.when(link(linkage), function (require) {
                    var main = linkage.packages[linkage.main];
                    var id = findIdForPath(main, got.path);
                    return require.exec(id);
                });
            });
        });
    })
    .then(null, Q.error)
}

main();

