
var Q = require("q/util");
var Require = require("./require").Require;
var Module = require("./module").Module;

exports.link = link;
function link(linkage) {
    var packages = linkage.packages;
    var requires = {};
    var ready;
    Object.keys(packages).forEach(function (href) {
        var pkg = packages[href];
        var require = readPackage(pkg, linkage, requires);
        ready = Q.when(ready, function () {
            return Q.when(require, function (require) {
                requires[href] = require;
            });
        });
    });
    return Q.when(ready, function () {
        return requires[linkage.main];
    });
}

function readPackage(pkg, linkage, requires) {
    var config = pkg.config || {};
    var PkgModule = config.requireSecure ?
        require("./secure/init").Module :
        Module;
    var factories = {};

    Object.keys(pkg.lib).forEach(function (id) {
        var module = pkg.lib[id];
        factories[id] = readModule(module, requires, PkgModule);
    });
    Object.keys(pkg.resources).forEach(function (path) {
        var resource = pkg.resources[path];
        readResource(resource);
    });

    return Q.when(Q.shallow(factories), function (factories) {

        var require = Require({
            // XXX TODO replace with an environment injector
            "scope": {
                "console": console
            },
            "factories": factories,
            "supportDefine": config.supportDefine || config.requireDefine
        });

        return require;

    });
}

function readModule(module, requires, Module) {
    if (module.external) {
        return function () {
            return requires[module.package](module.id);
        };
    } else if (module.fs) {
        var source = module.fs.read(module.path, 'r', 'utf-8');
        return Q.when(source, function (source) {
            module.source = source;
            if (module.loader) {
                var loader = module.loader;
                if (loader.compiler) {
                    return function (scope) {
                        // defer compilation to run-time for now TODO FIXME
                        var compiler = requires[loader.compiler]("");
                        var object = compiler.compile(source);
                        var factory = Module(object, module.href);
                        return factory(scope);
                    };
                } else {
                    throw new Error("unsupported loader XXX");
                }
            } else {
            }
            return Module(source, module.href);
        });
    } else if (module.system) {
        return function (scope) {
            return require(module.system);
        };
    } else if (module.capability) {
        return function () {
            // TODO
        };
    } else {
        console.log(module);
        throw new Error("WWW"); // TODO
    }
}

function readResource(resource) {
}

