
var Q = require("q/util");
var PACKAGE_FS = require("../lib/fs");
var FS = require("q-fs");
var HTTP = require("q-http");
var JAQUE = require("jaque");
var Root = require("q-fs/root").Fs;

// {path}, file:{path}, file:/{path}, file:///{path}, http:
// {directory}, {zip}, {zip}#, {zip}#{path}, {zip}#/{path}, {zip}#{zip}#{path}
// zip with reroot, zip without reroot

var absolute = FS.join(__dirname, "fs");
var relative = FS.relativeFromDirectory(process.cwd(), absolute);

var oracles = {
    1: {
        "list": ["package.json", "a", "b", "c"].sort(),
        "listTree": [".", "package.json", "a", "b", "c", "a/A", "b/B", "c/C"].sort(),
        "read": "{}\n"
    },
    2: {
        "list": ["package.json"],
        "listTree": [".", "package.json"].sort(),
        "read": "{}\n"
    }
};

var listening;
var port;
var nextPort = 8080;

// set up a file server
exports['test setup'] = function (ASSERT, done) {
    var app = JAQUE.FileTree(absolute);
    var server = HTTP.Server(app);
    listening = retry(function () {
        port = nextPort++;
        return server.listen(port);
    }, {"times": 1024});
    Q.when(listening, function () {
        console.log("Listening on port " + port);
        done();
    }, function () {
        port = undefined;
        ASSERT.ok(false, 'Could not set up local server.');
        done();
    });
};

// packages from local directories
[
    {"protocol": "", "base": relative},
    {"protocol": "file:", "base": relative},
    {"protocol": "", "base": absolute},
    {"protocol": "file:", "base": absolute},
    {"protocol": "file://", "base": absolute},
].forEach(function (perm) {
    test(perm.protocol + FS.join(perm.base, "package.1/1/2/3"), oracles[1]);
    test(perm.protocol + FS.join(perm.base, "package.2"), oracles[2]);
});

var extensions = [
    ".zip",
    ".zip#",
    ".zip#/"
];

// packages in archives, local or remote
[1, 2].forEach(function (n) {
    // local
    [relative, absolute].forEach(function (base) {
        [
            "",
            "file:"
        ].forEach(function (protocol) {
            extensions.forEach(function (extension) {
                test(
                    protocol + FS.join(base, "package." + n) + extension,
                    oracles[n]
                )
            });
        });

    });
    // remote
    extensions.forEach(function (suffix) {
        test("http://localhost:{port}/package." + n + suffix, oracles[n])
    });
});

[relative, absolute].forEach(function (base) {
    test(FS.join(base, "packages.zip#package.1/1/2/3"), oracles[1]);
    test(FS.join(base, "packages.zip#package.2"), oracles[2]);
    test(FS.join(base, "nested.zip#package.1.zip"), oracles[1]);
    test(FS.join(base, "nested.zip#package.2.zip"), oracles[2]);
});
test("http://localhost:{port}/packages.zip#package.1/1/2/3", oracles[1])
test("http://localhost:{port}/nested.zip#package.1.zip", oracles[1])
test("http://localhost:{port}/nested.zip#package.2.zip", oracles[2])

function test(path, oracle) {
    exports['test ' + path] = function (ASSERT, done) {
        path = path.replace("{port}", port);
        var got = PACKAGE_FS.get(path, {"fs": FS, "http": HTTP});
        Q.when(got, function (got) {
            var fs = Root(got.fs, got.path);
            return Q.when(fs, function (fs) {
                var actuals = {
                    "list": fs.list(""),
                    "listTree": fs.listTree(""),
                    "read": fs.read("package.json", "r", "utf-8")
                };
                return eventuallyVerify(ASSERT, actuals, oracle);
            });
        }).then(done, function (reason) {
            ASSERT.ok(false, reason);
            done();
        });
    };
}

function eventuallyVerify(ASSERT, actuals, oracle) {
    var each = {};
    Object.keys(actuals).forEach(function (key) {
        each[key] = Q.when(actuals[key], function (actual) {
            if (Array.isArray(actual))
                actual.sort();
            ASSERT.deepEqual(actual, oracle[key], key);
        });
    });
    return Q.shallow(each);
}

// path and href tests
[
    // file
    {
        "get": absolute,
        "href": absolute,
        "path": absolute
    },
    {
        "get": relative,
        "href": absolute,
        "path": absolute
    },
    {
        "get": absolute + "/package.1.zip",
        "href": absolute + "/package.1.zip#/",
        "path": "/"
    },
    {
        "get": relative + "/package.1.zip",
        "href": absolute + "/package.1.zip#/",
        "path": "/"
    },
    {
        "get": relative + "/packages.zip#package.1/1/2/3",
        "href": absolute + "/packages.zip#/package.1/1/2/3",
        "path": "/package.1/1/2/3"
    },
    {
        "get": relative + "/packages.zip#/package.1/1/2/3",
        "href": absolute + "/packages.zip#/package.1/1/2/3",
        "path": "/package.1/1/2/3"
    },
    // http
    {
        "get": "http://localhost:{port}/packages.zip",
        "href": "http://localhost:{port}/packages.zip#/",
        "path": "/"
    },
    {
        "get": "http://localhost:{port}/packages.zip#",
        "href": "http://localhost:{port}/packages.zip#/",
        "path": "/"
    },
    // packages package 1
    {
        "get": "http://localhost:{port}/packages.zip#package.1",
        "href": "http://localhost:{port}/packages.zip#/package.1",
        "path": "/package.1"
    },
    {
        "get": "http://localhost:{port}/packages.zip#package.1/",
        "href": "http://localhost:{port}/packages.zip#/package.1",
        "path": "/package.1"
    },
    {
        "get": "http://localhost:{port}/packages.zip#package.1/1/2/3",
        "href": "http://localhost:{port}/packages.zip#/package.1/1/2/3",
        "path": "/package.1/1/2/3"
    },
    // nested package 1
    {
        "get": "http://localhost:{port}/nested.zip#package.1.zip",
        "href": "http://localhost:{port}/nested.zip#/package.1.zip#/",
        "path": "/"
    },
    {
        "get": "http://localhost:{port}/nested.zip#package.1.zip#",
        "href": "http://localhost:{port}/nested.zip#/package.1.zip#/",
        "path": "/"
    },
    {
        "get": "http://localhost:{port}/nested.zip#package.1.zip#/",
        "href": "http://localhost:{port}/nested.zip#/package.1.zip#/",
        "path": "/"
    },
].forEach(function (test) {
    exports['test path/href ' + test.get] = function (ASSERT, done) {
        var path = test.get.replace(/{port}/, port);
        var got = PACKAGE_FS.get(path, {"fs": FS, "http": HTTP});
        Q.when(got, function (got) {
            ASSERT.equal(got.href, test.href.replace(/{port}/, port), 'href');
            ASSERT.equal(got.path, test.path, 'path');
        })
        .then(done, function (reason) {
            ASSERT.ok(false, JSON.stringify(reason));
            done();
        });
    };
});

[
    {
        "p1": absolute,
        "p2": absolute,
        "href": absolute,
        "path": absolute
    },
    {
        "p1": "http://localhost:{port}/packages.zip",
        "p2": "http://localhost:{port}/packages.zip",
        "href": "http://localhost:{port}/packages.zip#/",
        "path": "/"
    },
    {
        "p1": "http://localhost:{port}/nested.zip#package.1.zip#",
        "p2": "http://localhost:{port}/nested.zip",
        "href": "http://localhost:{port}/nested.zip#/",
        "path": "/"
    },
].forEach(function (test) {
    exports[
        'test path/href ' +
        JSON.stringify(test.p1) + ' ' +
        JSON.stringify(test.p2)
    ] = function (ASSERT, done) {
        var p1 = test.p1.replace(/{port}/, port);
        var p2 = test.p2.replace(/{port}/, port);
        var g1 = PACKAGE_FS.get(p1, {"fs": FS, "http": HTTP});
        Q.when(g1, function (g1) {
            var g2 = PACKAGE_FS.get(p2, g1);
            return Q.when(g2, function (g2) {
                ASSERT.equal(g2.href, test.href.replace(/{port}/, port), 'href');
                ASSERT.equal(g2.path, test.path, 'path');
            })
        })
        .then(done, function (reason) {
            ASSERT.ok(false, JSON.stringify(reason));
            done();
        });
    };
});

exports['test teardown'] = function (ASSERT) {
    Q.post(listening, 'stop');
};

function retry(callback, options) {
    options = options || {};
    options.start = options.start || new Date();
    return Q.when(Q.when(undefined, callback), undefined, function (reason) {
        if (options.times === undefined)
            options.times = Infinity;
        options.reasons = (options.reasons || []);
        options.reasons.push(reason);
        options.times -= 1;
        options.tries = (options.tries || 0) + 1;
        if (options.times <= 0) {
            options.stop = new Date();
            options.duration = options.stop - options.start;
            return Q.reject(options);
        } else {
            options.delay = Math.min(
                options.maxDelay || Infinity,
                (options.delay || 0) * (options.backOff || 1)
            );
            return Q.when(Q.delay(options.delay), function () {
                return retry(callback, options);
            });
        }
    });
};

function main() {
    return require("test").run(exports);
}

if (require.main === module)
    return main();

