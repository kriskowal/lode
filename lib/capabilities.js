
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

exports['node@0.4'] = function (options, config, pkg) {
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
        "resources": {}
    }
};

exports.package =  function (options, config, pkg) {
    var lib = {};
    return {
        "href": "capability:package@0",
        "ids": Object.keys(lib),
        "lib": lib,
        "resources": {}
    }
};

