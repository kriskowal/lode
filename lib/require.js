// -- kriskowal Kris Kowal Copyright (C) 2009-2010 MIT License

(function (require, exports) {

var FS = require("fs-boot");

/**
 * @module
 */

/*whatsupdoc*/

var Q = require("q");
var has = Object.prototype.hasOwnProperty;
var update = function (_object, object) {
    for (var key in object) {
        if (has.call(object, key)) {
            _object[key] = object[key];
        }
    }
};
var copy = function (object) {
    var _object = {};
    update(_object, object);
    return _object;
}

var enquote = typeof JSON !== "undefined" && JSON.stringify || function (text) {
    return text;
};

/**
 * Creates a `require` function, and arranges for modules
 * to be executed and their exports memoized, in a lexical
 * scope that includes:
 *
 * * `require(id)` with support for identifiers relative to
 *   the calling module.
 * * `require.loader` for direct access to the module
 *    loader, which can be used in nested requirers.
 * * `require.force(id)`
 * * `require.once(id, scope)` to execute but not memoize
 *   a module, with an optional object that owns additional
 *   free variables to inject into the module's lexical
 *   scope.
 * * `module`
 *   * `id`
 *   * `path`
 * * `exports`
 *
 * @param {{loader, modules, debug}} options
 * @constructor
 * @returns {require(id)}
 */

exports.Require = function (options) {
    options = options || {};
    var loader = options.loader;
    var factories = options.factories || {};
    var modules = options.modules || {};
    var apis = options.exports || {};
    var supportDefine = options.supportDefine;
    var sharedScope = options.scope || {};

    for (var id in apis)
        if (has.call(apis, id))
            modules[id] = {"exports": apis[id]};

    var load = function (id) {
        if (!factories[id]) {
            if (!loader) {
                return Q.reject("require: Can't load " + enquote(id));
            } else {
                factories[id] = loader.load(id);
            }
        }
        return factories[id];
    };

    var require = function (id, baseId, options) {
        var module, factory, exports, completed, require;
        options = options || {};
        id = resolve(id, baseId);
        if (has.call(modules, id)) {
            module = modules[id];
        } else if (has.call(factories, id)) {
            factory = factories[id];
            module = Module(id, factory.path);
            modules[id] = module;
            exports = modules[id].exports;
            require = Require(id);
            scope = {};
            update(scope, sharedScope);
            update(scope, options.scope || {});
            update(scope, {
                "require": require,
                "exports": exports,
                "module": module
            });
            if (supportDefine)
                scope.define = Define(require, exports, module);
            try {
                var returned = factory(scope);
                completed = true;
            } finally {
                if (!completed) {
                    delete modules[id];
                }
            }
            if (typeof returned !== "undefined") {
                module.exports = returned;
            }
        } else {
            throw new Error("require: Can't load " + enquote(id));
        }
        return module.exports;
    };

    // curries require for a module, so its baseId can be assumed
    var Require = function (baseId) {
        var _require = function (id) { return require(id, baseId); };
        _require.async = function (id) { return require.async(id, baseId) };
        _require.loader = loader;
        _require.main = modules[options.main];
        return _require;
    };

    var Define = function (require, exports, module) {
        return function () {
            var callback = arguments[arguments.length - 1];
            var returned = callback(require, exports, module);
            if (typeof returned !== "undefined")
                module.exports = returned;
            return returned;
        };
    };

    // creates a module object
    var Module = function (baseId, path) {
        var module = {};
        module.exports = {};
        module.id = baseId;
        module.path = path;
        return module;
    };

    // asynchronously adds module factories to a factory list
    var advanceFactories = function (id, factories) {
        return Q.when(load(id), function (factory) {
            return (factory.requirements || []).reduce(function (factories, requirement) {
                requirement = resolve(requirement, id);
                return Q.when(factories, function (factories) {
                    if (has.call(modules, requirement) || has.call(factories, requirement))
                        return factories;
                    return advanceFactories(requirement, factories);
                });
            }, factories);
        });
    };

    require.reload = function (id) {
        return Q.when(advanceFactories(id, {}), function (factories) {
            return exports.Require({
                "loader": loader,
                "factories": factories
            });
        });
    };

    require.ensure = function (ids, callback) {
        var _modules = copy(modules);
        var _factories = ids.reduce(function (factories, id) {
            return Q.when(factories, function (factories) {
                return advanceFactories(id, factories);
            });
        }, copy(factories));
        return Q.when(_factories, function (factories) {
            callback(exports.Require({
                "loader": loader,
                "factories": factories,
                "modules": _modules
            }));
        }, function (reason) {
            throw new Error(reason.message || reason);
        });
    };

    require.async = function (id, baseId) {
        var _factories = copy(factories);
        var _modules = copy(modules);
        return Q.when(advanceFactories(id, _factories), function (factories) {
            var _require = exports.Require({
                "loader": loader,
                "factories": factories,
                "modules": _modules
            });
            return _require(id, baseId);
        });
    };

    require.exec = function (id, scope) {
        var _factories = copy(factories);
        var _modules = copy(modules);
        return Q.when(advanceFactories(id, _factories), function (factories) {
            var _require = exports.Require({
                "loader": loader,
                "factories": factories,
                "modules": _modules,
                "main": id,
                "scope": sharedScope,
                "supportDefine": supportDefine
            });
            return _require(id, undefined, {
                "scope": scope
            });
        });
    };

    require.loader = loader;

    return require;
};

var resolve = function (id, baseId) {
    id = String(id);
    if (id.charAt(0) == ".") {
        id = FS.join(baseId, id);
    }
    // module ids need to use forward slashes, despite what the OS might say
    return FS.normal(id).replace(/\\/g, '/');
};

}).apply({},
    typeof exports !== "undefined" ? [
        require,
        exports
    ] : [
        (function (global) {
            return function (id) {
                return global["/" + id];
            }
        })(this),
        this["/require"] = {}
    ]
);

