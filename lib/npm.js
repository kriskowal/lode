
require.paths.splice(0, require.paths.length - 1, __dirname + '/../node_modules');

var Q = require("q");
var FS = require("q-fs");

exports.findPackage = findPackage;
function findPackage(name, versionPredicateString, options) {
    var predicate = VersionPredicate(versionPredicateString);
    return Q.when(getNpmPath(options), function (npmPath) {
        var path = FS.join(npmPath, name);
        var using;
        return Q.when(FS.list(path), function (versions) {
            versions.sort(compareVersions);
            for (var i = 0, ii = versions.length; i < ii; i++) {
                var consider = versions[i];
                if (predicate(consider)) {
                    using = consider;
                    break;
                }
            }
            if (!using) {
                throw new Error(
                    "Can't execute package because it depends on an" +
                    " NPM package that doesn't have an adequate version installed.  " +
                    JSON.stringify(versions) + " " + 
                    JSON.stringify(versionPredicateString)
                );
            } else {
                return FS.join(path, using, 'package');
            }
        }, function () {
            throw new Error(
                "Can't execute package because it depends on an" +
                " NPM package that isn't installed.  " + 
                JSON.stringify(name + " " + versionPredicateString)
            );
        });
    });
}

exports.getNpmPath = getNpmPath;
function getNpmPath(options) {
    return Q.when(readNpmrc(options), function (npmrc) {
        return FS.join(npmrc['-'].root || "/usr/local/lib/node", ".npm");
    });
}

function readNpmrc(options) {
    if (!options.npmrc) {
        var path = FS.join(process.env.HOME, ".npmrc");
        var content = FS.read(path, "r", "utf-8");
        options.npmrc = Q.when(content, function (content) {
            return require("./ini").decode(content);
        });
    }
    return options.npmrc;
}

exports.VersionPredicate = VersionPredicate;
function VersionPredicate(predicate) {
    return predicate
    .split(/\s*\|\|\s*/)
    .map(function (predicate) {
        return predicate
        .split(/\s*(&&|\s+)\s*/)
        .map(function (predicate) {
            var match = /^(<?>?=?)([\d\.\*]+)$/.exec(predicate);
            if (match) {
                var operator = match[1];
                var version = match[2];
                var relation = operators[operator];
                return function (candidate) {
                    if (candidate === "active")
                        return false;
                    if (version === "*")
                        return true;
                    var difference = compareVersions(candidate, version);
                    var satisified = relation(difference, 0);
                    return satisified;
                };
            } else {
                return function (candidate) {
                    return false;
                };
            }
        })
        .reduce(function (head, tail) {
            return function (candidate) {
                return head(candidate) && tail(candidate);
            }
        }, function (candidate) {
            return true;
        });
    })
    .reduce(function (head, tail) {
        return function (candidate) {
            return head(candidate) || tail(candidate);
        }
    }, function (candidate) {
        return false;
    });
}

exports.compareVersions = compareVersions;
function compareVersions(a, b) {
    a = a.split(".");
    b = b.split(".");
    var i = 0;
    while (true) {
        if (a.length == i)
            return 0;
        if (b.length == i)
            return 1;
        var ai = +a[i];
        var bi = +b[i];
        var diff = ai - bi;
        if (diff)
            return diff;
        i++;
    }
    return 0;
}

exports.compareVersionsDescending = compareVersionsDescending;
function compareVersionsDescending(a, b) {
    return -compareVersions(a, b);
}

var operators = {
    ">": function (a, b) {
        return a > b;
    },
    ">=": function (a, b) {
        return a >= b;
    },
    "<": function (a, b) {
        return a < b;
    },
    "<=": function (a, b) {
        return a <= b;
    },
    "=": function (a, b) {
        return a === b;
    },
    "": function (a, b) {
        return a === b;
    }
};

