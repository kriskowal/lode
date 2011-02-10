
var Q = require("q/util");
var FS = require("q-fs");
var Require = require("./lib/require").Require;
var Module = require("./lib/module").Module;
var ZIP = require("./lib/zip-fs");

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

function main2() {
    var path = process.argv[2] || '';
    var options = {
        "engines": [],
        "debug": false
    };
    var catalog = linkPackage(path, options);
    return Q.when(catalog, function (catalog) {
        console.log(JSON.stringify(catalog, null, 4));
    }).then(null, Q.error);
}

exports.linkPackage = linkPackage;
function linkPackage(path, options) {
    var configs = {};
    var catalog = {};
    var pkg = loadPackage(path, options, {}, catalog);
    return Q.when(pkg, function (pkg) {
        return Q.deep(catalog);
    });
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
function loadPackage(dependency, options, configs, catalog, file) {
    dependency = Dependency(FS, dependency);
    if (dependency.path)
        return loadPackagePath(dependency.path, options, configs, catalog, file);
    if (dependency.archive)
        return loadPackageArchive(dependency, options, configs, catalog);
    throw new Error("Cannot load package described by " + JSON.stringify(dependency));
}

function loadPackageArchive(dependency, options, configs, catalog) {
    var path = FS.join(dependency.basePath, dependency.archive);
    path = FS.canonical(path);
    catalog = catalog || {};
    configs = configs || {};
    return Q.when(path, function (path) {
        if (catalog[path])
            return catalog[path];
        return catalog[path] = Q.when(FS.read(path, "rb"), function (data) {
            var fs = ZIP.Fs(data).reroot();
            return Q.when(fs.read('package.json', 'r'), function (content) {
                var config = JSON.parse(content);
                config.fs = fs;
                var Pkg = identifyPackageStyle(config);
                return Pkg("", config, options, configs, catalog);
            });
        });
    });
}

function loadPackagePath(
    path,
    options,
    configs, // optional package.json cache
    catalog, // optional package cache
    file // optional already opened package.json file
) {
    path = FS.canonical(path);
    catalog = catalog || {};
    configs = configs || {};
    return Q.when(path, function (path) {
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
        return catalog[path] = Q.when(config, function (config) {
            var Pkg = identifyPackageStyle(config);
            return Pkg(path, config, options, configs, catalog);
        });
    });
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
    var fs = config.fs || FS;
    // a memo for discovered package.json information
    //configs = configs || {};
    // a memo for instantiated packages in this inclusion context
    //catalog = catalog || {};
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
    var linkage = link(basePath, config, options, loaders, configs, catalog);
    return Q.when(linkage, function (linkage) {

        // map the factories out of the linkage
        var factories = {};
        Object.keys(linkage).forEach(function (id) {
            factories[id] = linkage[id].factory;
        });

        // construct a requirer
        var require = Require({
            "factories": factories,
            "supportDefine": config.supportDefine || config.requireDefine
        });

        // names of all keys for public linkage
        var ids = config.public || Object.keys(factories);
        if (config.public) {
            config.public.forEach(function (id) {
                if (!factories[id])
                    throw new Error("The public module: " + id +
                        ", does not exit.");
            });
        }

        // permit gc
        factories = undefined;
        return {
            "path": basePath,
            "ids": ids,
            "linkage": linkage,
            "identify": function (path) {
                return Q.when(fs.canonical(path), function (path) {
                    if (path === basePath && config.main)
                        return "";
                    if (!idsByPath[path])
                        return Q.reject("path " + JSON.stringify(path) +
                            " does not correspond to a module");
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
    var fs = config.fs || FS;

    var mappings = loadMappings(fs, basePath, config.mappings, options, configs, catalog);

    var linkage = {};

    var includes = config.includes || [];
    return Q.ref(includes.map(function (include) {
        var dependency = Dependency(fs, include, basePath);
        return loadPackage(
            dependency,
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
                linkage[id] = {
                    "package": pkg.path,
                    "id": id,
                    "factory": function () {
                        return pkg.require(id);
                    }
                };
            });
        });

        // own linkage
        var roots = findRoots(basePath, config, options);
        var finds = findModules(roots, config);
        return Q.when(finds, function (finds) {
            return loadModules(fs, finds, loaders);
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
                linkage[id] = {
                    "path": module.path,
                    "content": module.content,
                    "loader": module.loader,
                    "factory": factory
                };
            });

            // mappings linkage
            return Q.when(mappings, function (mappings) {

                // weave in the mappings of the subpackages
                Object.keys(mappings).forEach(function (baseId) {
                    var pkg = mappings[baseId];
                    pkg.ids.forEach(function (id) {
                        linkage[fs.join(baseId, id)] = {
                            "package": pkg.path,
                            "id": id,
                            "factory": function () {
                                return pkg.require(id);
                            }
                        };
                    });
                });

                return linkage;
            });

        });

    });
}

function findRoots(basePath, config, options) {
    var roots = [""];
    var fs = config.fs || FS;
    if (options.engines) {
        roots = concat(roots.map(function (root) {
            var roots = options.engines.map(function (engine) {
                return fs.join(root, "engines", engine);
            });
            roots.unshift(root);
            return roots;
        }));
    }
    if (options.debug) {
        roots = concat(roots.map(function (root) {
            return [
                root,
                fs.join(root, "debug")
            ];
        }));
    }
    return roots.map(function (root) {
        return fs.join(basePath, root);
    });
}

function findModules(roots, config) {
    // for each root, find all of the files within
    // that root
    var fs = config.fs || FS;
    return Q.when(roots.map(function (root) {

        var mains;
        if (config.main) {
            var main = fs.join(root, config.main);
            var isFile = fs.isFile(main);
            mains = Q.when(isFile, function (isFile) {
                var extension = fs.extension(main);
                if (isFile) {
                    return [{
                        "id": "",
                        "extension": extension,
                        "path": fs.canonical(main)
                    }];
                } else {
                    return [];
                }
            });
        } else {
            mains = [];
        }

        var lib = fs.join(root, "lib");
        var paths = fs.listTree(lib, function (path, stat) {
            return stat.isFile();
        });
        var modules = Q.when(paths, function (paths) {
            return paths.map(function (path) {
                var extension = fs.extension(path);
                var id = fs.base(fs.relative(root, path), extension);
                return Q.when(fs.canonical(path), function (canonical) {
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

function loadModules(fs, descs, loaders) {
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
                    "content": fs.read(path, "r", "UTF-8")
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

function loadMappings(fs, basePath, mappings, options, configs, catalog) {
    if (!mappings)
        return {};
    var packages = Object.keys(mappings).map(function (id) {
        var dependency = Dependency(fs, mappings[id], basePath);
        return {
            "id": id,
            "package": loadPackage(dependency, options, configs, catalog)
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

function Dependency(fs, dependency, basePath) {
    if (typeof dependency === "string")
        dependency = {"path": dependency};
    if (basePath)
        dependency.basePath = basePath;
    if (dependency.path && dependency.basePath)
        dependency.path = fs.join(dependency.basePath, dependency.path);
    return dependency;
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

