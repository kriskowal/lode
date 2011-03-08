
var nodeIds = [
    'assert',
    'buffer',
    'child_process',
    'console',
    'constants',
    'crypto',
    'dgram',
    'dns',
    'events',
    'freelist',
    'fs',
    'http',
    'https',
    'module',
    'net',
    'os',
    'path',
    'querystring',
    'readline',
    'repl',
    'stream',
    'string_decoder',
    'sys',
    'timers',
    'tls',
    'tty',
    'tty_posix',
    'tty_win32',
    'url',
    'util',
    'vm'
];

exports['node@0.4'] = function () {
    var lib = {};
    lib[""] = {
        "require": function () {
            return process;
        }
    };
    nodeIds.forEach(function (id) {
        lib[id] = {
            "system": id
        }
    });
    return {
        "href": "capability:node@0.4",
        "ids": Object.keys(lib),
        "lib": lib,
        "resources": {},
        "includes": []
    }
};

exports["jetpack/self@1.0"] =  function (options) {
    var href = options.href;
    var main = {
        "require": function (linkage) {
            var packages = linkage.packages;
            var pkg = packages[href];
            var resources = pkg.resources;
            return {
                "data": {
                    "load": function (path) {
                        return resources["data/" + path].content.toString("utf-8");
                    },
                    "url": function (path) {
                        return 'data:base64,' + resources["data/" + path].content.toString("base64");
                    }
                }
            };
        }
    };
    var lib = {"": main};
    return {
        "href": "capability:jetpack/self@1.0",
        "ids": Object.keys(lib),
        "lib": lib,
        "resources": {},
        "includes": []
    }
};

exports["package@0"] =  function (options) {
    var href = options.href;
    var main = {
        "require": function (linkage) {
            var packages = linkage.packages;
            var pkg = packages[href];
            var resources = pkg.resources;
            return {
                "url": pkg.config.url,
                "read": function (path, charset) {
                    var resource = resources[path];
                    if (!resource)
                        throw new Error("Can't read resource " + JSON.stringify(path));
                    if (charset)
                        return resource.content.toString(charset);
                    return resource.content;
                }
            };
        }
    };
    var lib = {"": main};
    return {
        "href": "capability:package@0",
        "ids": Object.keys(lib),
        "lib": lib,
        "resources": {},
        "includes": []
    }
};

