
exports.VersionPredicate = VersionPredicate;
function VersionPredicate(predicate) {
    return predicate
    .split(/\s*\|\|\s*/)
    .map(function (predicate) {
        return predicate
        .split(/\s*(&&|\s+)\s*/)
        .map(function (predicate) {
            var match = /^(<?>?=?)([\d\.]+)$/.exec(predicate);
            if (match) {
                var operator = match[1];
                var version = match[2];
                var relation = operators[operator];
                return function (candidate) {
                    if (candidate === "active")
                        return false;
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
            return -1;
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

