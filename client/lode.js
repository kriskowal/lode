(function (global, linkage) {
    var packages = linkage.p;
    var main = packages[linkage.m];
    var requires = {};

    var console = global.console || {
        "log": function () {},
        "warn": function () {},
        "error": function () {}
    };

    var getRequire = function (hash) {
        if (!requires[hash])
            requires[hash] = Require(packages[hash]);
        return requires[hash];
    };

    var Require = function (pkg) {
        var modules = {};
        var Require = function (baseId) {
            return function (id) {
                id = resolve(id, baseId);
                return require(id);
            }
        };
        var require = function (id) {
            if (!modules[id]) {
                var reference = pkg.l[id];
                if (!reference)
                    throw new Error("require: Can't load \"" + id + "\"");
                var module = modules[id] = {
                    "id": id,
                    "exports": {}
                };
                var require = Require(id);
                var define = function () {
                    var last = arguments[arguments.length - 1];
                    if (typeof last === "function") {
                        module.exports = last(
                            require,
                            module.exports,
                            module
                        );
                    } else {
                        module.exports = last;
                    }
                };
                if (typeof reference === "function") {
                    var returned = reference(
                        require,
                        module.exports,
                        module,
                        define,
                        pkg,
                        console
                    );
                    if (typeof returned !== "undefined") {
                        module.exports = returned;
                    }
                } else {
                    return getRequire(reference.pkg)(reference.id);
                }
            }
            return modules[id].exports;
        };
        return require;
    };

    function resolve(id, baseId) {
        id = String(id);
        var ids = id.split("/");
        // assert ids.length >= 1 since "".split("") == [""]
        var first = ids[0];
        if (first === ".." || first === ".") {
            var baseIds = baseId.split("/");
            baseIds.pop();
            ids.unshift.apply(ids, baseIds);
        }
        var parts = [];
        while (ids.length) {
            var part = ids.shift();
            if (part === ".") {
            } else if (part === "..") {
                parts.pop();
            } else {
                parts.push(part);
            }
        }
        return parts.join("/");
    }

    Require(main)("");

})
