
var Q = require("q/util");
var FS = require("q-fs");
var Require = require("./lib/require").Require;
var Module = require("./lib/module").Module;

function main() {
    var script = process.argv[2] || '';
    var options = {
        "engines": [],
        "debug": false
    };
    var pkg = loadPackageContaining(script, options);
    return Q.when(pkg, function (pkg) {
        var id = pkg.identify(script);
        return Q.when(id, pkg.require.exec || pkg.require);
    }).then(null, Q.error);
}

// path can be the path of the package or
// the path of something in the package
exports.loadPackageContaining = loadPackageContaining;
function loadPackageContaining(path, options, configs, catalog) {
    return Q.when(FS.canonical(path), function (path) {
        var found = findPackage(path);
        return Q.when(found, function (found) {
            return loadPackage(
                found.path,
                options,
                configs,
                catalog,
                found.file
            );
        }, function noPackage() {
            return NoPackage(path, options);
        }); 
    });
}

// path can be the path of the package or
// the path of a script in the package
function findPackage(path) {
    var file = FS.open(FS.join(path, "package.json"));
    return Q.when(file, function (file) {
        return {
            "path": path,
            "file": file
        };
    }, function (reason) {
        var next = FS.directory(path);
        if (next === path) {
            return Q.reject("Package not found.");
        } else {
            return findPackage(next);
        }
    });
}

exports.loadPackage = loadPackage;
function loadPackage(
    path,
    options,
    configs, // optional package.json cache
    catalog, // optional package cache
    file // optional already opened package.json file
) {
    path = FS.canonical(path);
    catalog = catalog || {};
    configs = configs || {};
    catalog[path] = Q.when(path, function (path) {
        if (catalog[path])
            return catalog[path];
        var config = configs[path];
        if (!config) {
            file = file || FS.open(FS.join(path, "package.json"));
            var content = Q.post(file, "read");
            config = configs[path] = Q.when(content, function (content) {
                Q.post(file, 'close');
                file = undefined;
                return JSON.parse(content);
            });
            content = undefined;
        }
        return Q.when(config, function (config) {
            var Pkg = identifyPackageStyle(config);
            var pkg = Pkg(path, config, options, configs, catalog);
            return pkg;
        });
    });
    return catalog[path];
}

function identifyPackageStyle(json) {
    if (json.lode) {
        return LodePackage;
    /*
    } else if (json.mappings) {
        return NodulesPackage;
    } else if (Array.isArray(json.dependencies)) {
        return NarwhalPackage;
    } else {
        return NpmPackage;
    */
    } else {
        return NoPackage
    }
}

function NoPackage(script, options) {
    var basePath = FS.dirname(script);
    return {
        "identify": function (path) {
            return Q.when(FS.canonical(path), function (path) {
                if (!FS.contains(basePath, path))
                    return Q.reject(path + " is outside of " + basePath);
                return FS.relative(script, path);
            });
        },
        "require": function (id) {
            return require(id);
        }
    };
}

// config
//  include
//  mappings
//  requires
//  main
// options
//  engines
//  debug
//  inject

function LodePackage(basePath, config, options, configs, catalog) {
    if (typeof config.lode === "object")
        update(config, config.lode);
    // a memo for discovered package.json information
    //configs = configs || {};
    // a memo for instantiated packages in this inclusion context
    //catalog = catalog || {};
    // module factories for this package
    var factories = {};
    // paths to identifiers, local to this package
    var idsByPath = {};
    // loaders
    var jsLoader = {
        "compile": Module
    };
    var loaders = [
        {
            "extension": "",
            "loader": jsLoader
        },
        {
            "extension": ".js",
            "loader": jsLoader
        }
    ];
    var linkage = link(basePath, config, options, loaders, configs, catalog, factories);
    return Q.when(linkage, function (linkage) {
        // construct a requirer
        var require = Require({
            "factories": factories,
            "supportDefine": config.supportDefine || config.requireDefine
        });
        // names of all keys for further linkage
        var ids = Object.keys(factories);
        // permit gc
        factories = undefined;
        return {
            "id": basePath,
            "ids": ids,
            "identify": function (path) {
                return Q.when(FS.canonical(path), function (path) {
                    if (path === basePath && config.main)
                        return "";
                    if (!idsByPath[path])
                        return Q.reject("path " + JSON.stringify(path) + " does not correspond to a module");
                    return idsByPath[path];
                });;
            },
            "require": require
        };
    });
    linkage = undefined;
}

// find the transitive includes
// topologically sort the includes
// for each included package
//      link the includes
//      link our own modules
//      link the mappings

function link(basePath, config, options, loaders, configs, catalog, factories) {

    var mappings = loadMappings(basePath, config.mappings, options, configs, catalog);

    var includes = config.includes || [];
    return Q.ref(includes.map(function (include) {
        var path = FS.join(basePath, include);
        return loadPackage(
            path,
            options,
            configs,
            catalog
        );
    }))
    .then(Q.shallow)
    .then(function (includes) {

        // included linkage
        includes.forEach(function (pkg) {
            pkg.ids.forEach(function (id) {
                factories[id] = function () {
                    return pkg.require(id);
                };
            });
        });

        // own linkage
        var roots = findRoots(basePath, config, options);
        var finds = findModules(roots, config);
        return Q.when(finds, function (finds) {
            return loadModules(finds, loaders);
        })
        .then(function (modules) {

            var ids = Object.keys(modules.byId);
            ids.forEach(function (id) {
                var module = modules.byId[id];
                var factory = module.loader.compile(module.content, module.path);
                if (config.requireDefine) {
                    factory = (function (factory) {
                        return function (inject) {
                            var define = inject.define;
                            var defined;
                            inject.define = function () {
                                defined = true;
                                return define.apply(this, arguments);
                            };
                            try {
                                return factory(inject);
                            } finally {
                                if (!defined) {
                                    throw new Error("module failed to call defined: " + inject.module.id);
                                }
                            }
                        };
                    })(factory);
                }
                factories[id] = factory;
            });

            // mappings linkage
            return Q.when(mappings, function (mappings) {

                // weave in the mappings of the subpackages
                Object.keys(mappings).forEach(function (baseId) {
                    var pkg = mappings[baseId];
                    pkg.ids.forEach(function (id) {
                        factories[FS.join(baseId, id)] = function () {
                            return pkg.require(id);
                        };
                    });
                });

            });

        });

    });
}

function findRoots(basePath, config, options) {
    var roots = [""];
    if (options.engines) {
        roots = concat(roots.map(function (root) {
            var roots = options.engines.map(function (engine) {
                return FS.join(root, "engines", engine);
            });
            roots.unshift(root);
            return roots;
        }));
    }
    if (options.debug) {
        roots = concat(roots.map(function (root) {
            return [
                root,
                FS.join(root, "debug")
            ];
        }));
    }
    return roots.map(function (root) {
        return FS.join(basePath, root);
    });
}

function findModules(roots, config) {
    // for each root, find all of the files within
    // that root
    return Q.when(roots.map(function (root) {

        var mains;
        if (config.main) {
            var main = FS.join(root, config.main);
            var isFile = FS.isFile(main);
            mains = Q.when(isFile, function (isFile) {
                var extension = FS.extension(main);
                if (isFile) {
                    return [{
                        "id": "",
                        "extension": extension,
                        "path": FS.canonical(main)
                    }];
                } else {
                    return [];
                }
            });
        } else {
            mains = [];
        }

        var lib = FS.join(root, "lib");
        var paths = FS.listTree(lib, function (path, stat) {
            return stat.isFile();
        });
        var modules = Q.when(paths, function (paths) {
            return paths.map(function (path) {
                var extension = FS.extension(path);
                var id = FS.base(FS.relative(root, path), extension);
                return Q.when(FS.canonical(path), function (canonical) {
                    return {
                        "id": id,
                        "extension": extension,
                        "path": canonical
                    };
                });
            });
        });

        return [
            mains,
            modules
        ]

    }))
    .then(Q.deep)
    .then(concat)
    .then(concat)
}

function loadModules(descs, loaders) {
    // find all of the loader candidates for each
    // file based on their extensions
    var lookup = {};
    descs.forEach(function (desc) {
        lookup[desc.id] = lookup[desc.id] || {};
        lookup[desc.id][desc.extension] = desc.path;
    });

    // find the appropirate loader for each file
    // basename (identifier) based on the priority
    // order of each extension
    var byId = {};
    var byPath = {};
    Object.keys(lookup).forEach(function (id) {
        var paths = lookup[id];
        for (var i = 0, ii = loaders.length; i < ii; i++) {
            var loader = loaders[i];
            var path = paths[loader.extension];
            if (path) {
                var module = {
                    "path": path,
                    "id": id,
                    "loader": loader.loader,
                    "content": FS.read(path)
                }
                byId[id] = module;
                byPath[path] = module;
                break;
            }
        }
    });

    return Q.deep({
        "byPath": byPath,
        "byId": byId
    });
}

function loadMappings(basePath, mappings, options, configs, catalog) {
    if (!mappings)
        return {};
    var packages = Object.keys(mappings).map(function (id) {
        var path = mappings[id];
        path = FS.join(basePath, path);
        return {
            "id": id,
            "package": loadPackage(path, options, configs, catalog)
        };
    });
    return Q.deep(packages)
    .then(function (descs) {
        var packages = {};
        descs.forEach(function (desc) {
            packages[desc.id] = desc.package;
        });
        return packages;
    })
    .then(Q.deep)
}

function update(target, source) {
    for (var name in source) {
        target[name] = source[name];
    }
};

function concat(arrays) {
    return Array.prototype.concat.apply([], arrays);
};

main();

