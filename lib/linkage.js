
/**
 * This module provides the loadLinkage(dependency, options)
 * function which is responsible for asynchronously loading
 * the information about all of the packages, modules, and
 * resources that need to be loaded for a module in that
 * package to be executed.  The linkage tree does not
 * contain or cause any files apart from package.json and
 * zip archives to be read from the file system, but the
 * directory structure of subdirectories of each package
 * root containing resources and modules are deeply listed.
 */

// analyze linkage
// read
// compile
// link

//  runtimes
//      linkage
//  documentation scrapers
//      sources and extensions
//  javascript linters
//      sources and extensions
//  package builders
//      resources
//      javascripts
//          sources
//          (interpreted modules will be resources)


var Q = require("q/util");
var URL = require("url"); // node
var FS = require("q-fs");
var HTTP = require("q-http");
var MOCK = require("q-fs/mock");
var Mock = MOCK.Fs;
var Root = require("q-fs/root").Fs;
var PFS = require("./fs");
var Require = require("./require").Require;
var Module = require("./module").Module;

exports.requireHref = requireHref
function requireHref(href, options) {
    options = options || defaultOptions();
    var got = PFS.get(href, options);
    return Q.when(got, function (got) {
        var suboptions = Object.create(options);
        suboptions.fs = got.fs;
        suboptions.path = got.path;
        suboptions.href = got.href;
        return Q.when(findPackage(got.path, got.fs), function (found) {
            var linkage = loadLinkage(found.path, suboptions);
            return Q.when(linkage, function (linkage) {
                return Q.when(link(linkage, options), function (require) {
                    var main = linkage.packages[linkage.main];
                    var id = findIdForPath(main, got.path);
                    return require.exec(id);
                });
            });
        });
    });
}

function requireDependency(dependency, options) {
    ptions = options || defaultOptions();
    dependency = Dependency(dependency);
    return Q.when(loadLinkage(dependency, options), function (linkage) {
        return Q.when(link(linkage, options), function (require) {
            var main = linkage.packages[linkage.main];
            return require.exec("");
        });
    });
}

// in a given file system, finds the package that contains the given path
exports.findPackage = findPackage;
function findPackage(path, fs) {
    var file = fs.open(fs.join(path, "package.json"));
    return Q.when(file, function (file) {
        return {
            "path": path,
            "file": file
        };
    }, function (reason) {
        var next = fs.directory(path);
        if (next === path) {
            return Q.reject("Package not found.");
        } else {
            return findPackage(next, fs);
        }
    });
}

exports.findIdForPath = findIdForPath;
function findIdForPath(linkage, path) {
    var lib = linkage.lib;
    var main = lib[""];
    if (main) {
        if (path === linkage.path)
            return "";
    }
    var keys = Object.keys(lib);
    for (var i = 0, ii = keys.length; i < ii; i++) {
        var id = keys[i];
        var module = lib[id];
        if (path === module.packagePath) {
            return id;
        }
    }
    throw new Error(
        "Can't find module for path " + JSON.stringify(path) +
        " in " + JSON.stringify(linkage.href)
    );
}

exports.readJavaScript = readJavaScript;
function readJavaScript(href, options) {
    options = options || defaultOptions();
    var linkage = loadLinkageForHref(href, options);
    return Q.when(linkage, function (linkage) {
        read(linkage);
        return Q.when(compile(linkage, options), function () {
            var packages = {};
            Object.keys(linkage.packages).forEach(function (href) {
                var lib = {};
                var pkg = linkage.packages[href];
                Object.keys(pkg.lib).forEach(function (id) {
                    lib[id] = pkg.lib[id].javascript; // XXX TODO
                });
                packages[href] = lib;
            });
            return packages;
        });
    });
}

function loadLinkageForHref(href, options) {
    href = href || "";
    options = options || defaultOptions();
    var got = PFS.get(href, options);
    return Q.when(got, function (got) {
        var suboptions = Object.create(options);
        suboptions.fs = got.fs;
        suboptions.path = got.path;
        suboptions.href = got.href;
        return loadLinkage(got.path, suboptions);
    });
}

function defaultOptions() {
    return {
        "engines": ["lode", "node"],
        "debug": true,
        "fs": FS,
        "http": HTTP
    };
}

exports.loadLinkage = loadLinkage;
function loadLinkage(rootDependency, options) {
    return Q.when(loadPackageLinkage(rootDependency, options), function (main) {
        return Q.deep({
            "main": main.href,
            "capabilities": Object.keys(options.capabilities),
            "packages": options.linkageMemo,
            "metaPackages": options.metaLinkageMemo,
            "warnings": options.warnings
        });
    });
}

function loadPackageLinkage(dependency, options, config) {
    config = config || {};
    dependency = Dependency(dependency);
    var linkage = options.linkageMemo = options.linkageMemo || {};
    var metaLinkage = options.metaLinkageMemo = options.metaLinkageMemo || Object.create(linkage);
    var capabilities = options.capabilities = options.capabilities || {};
    if (dependency.archive !== undefined && dependency.href === undefined) {
        dependency.href = dependency.archive;
        return loadPackageLinkage(dependency, options, config);
    } else if (dependency.name !== undefined && dependency.href === undefined) {
        var registry = dependency.registry || config.registry;
        var catalog = dependency.catalog || config.catalog;
        if (!registry !== !catalog) {
            if (registry === "npm") {
                var NPM = require("./npm");
                var href = NPM.findPackage(dependency.name, dependency.version, options);
                return Q.when(href, function (href) {
                    dependency.href = href;
                    return loadPackageLinkage(dependency, options, config);
                });
            } else {
                throw new Error("Can't load from registry " + JSON.stringify(registry));
            }
        } else if (registry && catalog) {
            throw new Error("Can only use either registry or catalog, not both in " + JSON.stringify(options.href));
        } else {
            throw new Error(
                "Can't load package by name@version without a registry " + 
                "property on either the dependency or the package config.  " +
                JSON.stringify(dependency) + " from " + JSON.stringify(options.href)
            );
        }
    } else if (dependency.system !== undefined) {
        var href = "system:" + dependency.system;
        options.capabilities[href] = true;
        return linkage[href] = {
            "href": href,
            "ids": [""],
            "lib": {
                "": {
                    "system": dependency.system
                }
            },
            "resources": {}
        };
    } else if (dependency.href !== undefined) {
        var info = loadPackageInfo(dependency, options);
        return Q.when(info, function (info) {
            if (!linkage[info.href]) {

                linkage[info.href] = Q.when(info.config, function (config) {

                    var suboptions = Object.create(options);
                    suboptions.fs = info.fs;
                    suboptions.path = info.path;
                    suboptions.href = info.href;

                    var lib = {};
                    var resources = {};

                    // get the included packages
                    var ready = loadDeepIncludes(info, lib, resources);
                    return Q.when(ready, function () {
                        return {
                            "href": info.href,
                            "path": info.path,
                            "fs": info.fs,
                            "config": config,
                            "ids": config.public || Object.keys(lib).filter(function (id) {
                                return lib[id].path;
                            }),
                            "lib": lib,
                            "resources": resources
                        };
                    });

                });
            }
            return linkage[info.href];
        });
    } else if (dependency.capability !== undefined) {
        var href = "capability:" + dependency.capability;
        options.capabilities[dependency.capability] = true;
        var cap = require("./capabilities")[dependency.capability](options);
        return linkage[href] = cap;
    } else {
        throw new Error("Can't load package " + JSON.stringify(dependency));
    }
}

exports.loadPackageInfo = loadPackageInfo;
function loadPackageInfo(dependency, options) {
    options = options || {};
    options.warn = options.warn || function (warning) {
        options.warnings = options.warnings || [];
        options.warnings.push(warning);
    };
    var roots = options.roots = options.roots || enumerateRoots(options);
    var memo = options.infoMemo = options.infoMemo || {};
    options.fsMemo = options.fsMemo || {};
    dependency = Dependency(dependency);
    if (dependency.href !== undefined) {

        var got = PFS.get(dependency.href, options);

        return Q.when(got, function (got) {
            if (!memo[got.href]) {
                var fs = Root(got.fs, got.path);
                memo[got.href] = Q.when(fs, function (fs) {
                    var configContent = fs.read("package.json");
                    var config = Q.when(configContent, function (content) {
                        return configure(
                            JSON.parse(content),
                            dependency,
                            options
                        );
                    }, function (reason) {
                        return Q.reject(
                            "Can't read package.json from " +
                            JSON.stringify(got.href)
                        );
                    })
                    return Q.when(config, function (config) {

                        var suboptions = Object.create(options);
                        suboptions.fs = got.fs;
                        suboptions.path = got.path;
                        suboptions.href = got.href;

                        var languages = loadLanguageInfo(config);
                        var mappings = loadMappingInfo(config, suboptions);
                        var includes = loadIncludesInfo(config, suboptions);
                        var lib = loadLibInfo(
                            config,
                            suboptions,
                            fs,
                            got,
                            roots,
                            languages,
                            mappings
                        );
                        var resources = loadResourcesInfo(
                            config,
                            suboptions,
                            fs,
                            roots
                        );

                        return {
                            "href": got.href,
                            "path": got.path,
                            "fs": got.fs,
                            "config": config,
                            "lib": lib,
                            "resources": resources,
                            "includes": includes
                        };

                    }, function (reason) {
                        return Q.reject(
                            "Can't parse package.json in " +
                            JSON.stringify(got.href) + ".  " +
                            (reason && reason.message || reason)
                        );
                    });

                });
            }
            return memo[got.href];
        });

    } else if (dependency.capability !== undefined) {
        var href = "capability:" + dependency.capability;
        options.capabilities[dependency.capability] = true;
        var cap = require("./capabilities")[dependency.capability]();
        return memo[href] = cap;
    } else {
        throw new Error(
            "Can't load dependency: " + JSON.stringify(dependency)
        );
    }
}

function loadLanguageInfo(config) {
    var languages = config.languages || [];
    // translate the extension: compiler shorthand into the prioritized
    // language array
    if (isObject(languages)) {
        languages = Object.keys(languages).map(function (extension) {
            return {
                "extension": extension,
                "compiler": languages[extension]
            };
        });
    }
    return Q.shallow(languages.map(function (language) {
        if (language.compiler) {
            return language;
        } else {
            throw new Error("Languages must have a compiler property.");
        }
    })
    .concat([
        {"extension": ""},
        {"extension": ".js"}
    ]));
}

function loadMappingInfo(config, options) {
    var mappings = config.mappings = config.mappings || {};
    var map = {};
    Object.keys(mappings).map(function (key) {
        var mapping = mappings[key] = Dependency(mappings[key], key);
        var pkg = loadPackageLinkage(mapping, options, config);
        map[key] = pkg;
    });
    // begin preparing these in parallel with the lib
    // preparation, then join toward the end of that
    // section
    return Q.deep(map);
}

function loadIncludesInfo(config, options) {
    var includes = config.includes = config.includes || [];
    includes = includes.map(function (include) {
        // TODO replace config.includes[i] with a Dependency object
        return loadPackageInfo(include, options);
    });
    return Q.shallow(includes);
}

function loadLibInfo(config, options, fs, got, roots, languages, mappings) {
    var lib = Q.when(config, function (config) {
        return Q.ref(roots.map(function (root) {
            var path = fs.join(root, config.directory("lib"));
            return Q.when(fs.isDirectory(path), function (isDirectory) {
                if (isDirectory) {
                    return path;
                }
            });
        }))
        .then(Q.shallow)
        .then(function (roots) {
            return roots.filter(function (root) {
                return root !== undefined;
            });
        })
        .then(function (roots) {
            return roots.map(function (root) {
                return {
                    "path": root,
                    "fs": Root(fs, root)
                }
            });
        })
        .then(Q.deep)
        .then(function (roots) {
            return roots.map(function (root) {
                var list = root.fs.listTree("", function (path, stat) {
                    return stat.isFile();
                });
                return Q.when(list, function (list) {
                    var tree = {};
                    list.forEach(function (path) {
                        var extension = fs.extension(path);
                        var x = RegExp(regExpEscape(extension) + '$');
                        var id = path.replace(x, '');
                        var candidates = tree[id] = tree[id] || {};
                        candidates[extension] = {
                            "href": got.href.replace(/\/$/, "") + "/" + path,
                            "fs": root.fs,
                            "path": path,
                            "packagePath": got.fs.join(
                                got.fs.ROOT,
                                got.path,
                                root.path,
                                path
                            ),
                            "id": id,
                            "package": got.href
                        };
                    });
                    return tree;
                })
            })
        })
        .then(Q.shallow)
        .then(function (roots) {
            // flatten the roots
            var tree = {};

            // handle modules and main properties
            var modules = config.modules || {};
            // consolidate the "main" property into the "modules" property.
            if (config.main)
                modules[""] = config.main;
            Object.keys(modules).forEach(function (id) {
                var path = modules[id];
                var extension = fs.extension(path);
                // where the extension is not provided:
                if (!extension) { // FIXME the corresponding extension is not necessarily ".js".
                    path = path + ".js";
                    extension = ".js";
                }
                var packagePath = got.fs.join("/", got.path, path);
                tree[id] = tree[id] || {};
                tree[id][extension] = {
                    "href": got.fs.join(got.href, path),
                    "fs": fs,
                    "path": path,
                    "packagePath": packagePath,
                    "id": "",
                    "extension": extension
                }
            });

            roots.forEach(function (root) {
                update(tree, root);
            });

            return Q.when(languages, function (languages) {
                // elect a language for each extension
                var elections = {};
                Object.keys(tree).forEach(function (id) {
                    var candidates = tree[id];
                    var extensions = Object.keys(candidates);
                    for (var i = 0, ii = languages.length; i < ii; i++) {
                        var language = languages[i];
                        if (candidates[language.extension]) {
                            var election = candidates[language.extension];
                            if (extensions.length > 1) {
                                options.warn(
                                    "Multiple candidates for module " +
                                    JSON.stringify(id) + " in package " +
                                    JSON.stringify(got.href) + " including " +
                                    JSON.stringify(extensions) + ". Chose " +
                                    JSON.stringify(election.path) + "."
                                );
                            }
                            if (language.compiler)
                                election.language = language;
                            elections[id] = election;
                            break;
                        }
                    }
                });
                return elections;
            });
        })
    })
    .then(function (libTree) {
        // merge the mappings trees
        return Q.when(mappings, function (mappings) {
            var tree = {};
            Object.keys(mappings).forEach(function (key) {
                var mapping = mappings[key];
                var lib = mapping.lib;
                var ids = mapping.ids;
                ids.forEach(function (id) {
                    tree[fs.join(key, id)] = {
                        "reference": true,
                        "package": mapping.href,
                        "id": id
                    };
                });
            });
            update(tree, libTree);
            return tree;
        });
    })
    return lib;
}

function loadResourcesInfo(config, suboptions, fs, roots) {
    var files = {};
    var resources = Q.when(config, function (config) {
        // load resources
        var resources = config.resources = config.resources || [];
        var tree = {};
        resources.forEach(function (resource) {
            // construct a resource tree
            tree[resource] = Q.ref(roots.map(function (root) {
                // from the resource directory of each root
                return fs.join(root, resource);
            }))
            // and, depending on whether each "resource root"
            // is a directory or a file, include it in the file
            // tree
            .then(function (roots) {
                return roots.map(function (root) {
                    return Q.when(fs.stat(root), function (stat) {
                        if (stat.isDirectory()) {
                            return root;
                        } else if (stat.isFile()) {
                            // XXX FIXME race condition
                            files[root] = {
                                "fs": fs,
                                "path": root
                            };
                        }
                    }, function () {
                        // ignore non-existant files
                    });
                })
            })
            // producing an array of values, either undefined
            // or a root name
            .then(Q.shallow)
            // filter out the undefineds (which correspond to
            // roots that don't exist)
            .then(function (roots) {
                return roots.filter(function (root) {
                    return root !== undefined;
                });
            })
            // and construct a file system root
            .then(function (roots) {
                return roots.map(function (root) {
                    return Root(fs, root);
                });
            })
            // reduce them to a record
            .then(Q.shallow)
            // collapse all of the roots into a record of
            // where to find each file in the root.  we don't
            // read the files yet because it's unclear that
            // these are the resources that will be
            // incorporated into the ultimate package, since
            // some may be masked by includes.
            .then(mergeRootsIntoTree)
        });
        return Q.shallow(tree);
    })
    // take all of the file system roots and construct a single tree
    .then(mergeNestedTrees)
    // update the tree with individual files
    .then(function (tree) {
        update(tree, files);
        return tree;
    });
    return resources;
}

function loadDeepIncludes(info, lib, resources, included) {
    included = included || {};
    if (included[info.href])
        return;
    return Q.when(info.includes || [], function (includes) {
        var done;
        includes.forEach(function (include) {
            done = Q.when(done, function () {
                loadDeepIncludes(include, lib, resources, included)
            });
        });
        done = Q.when(done, function () {
            return Q.when(info.lib, function (_lib) {
                update(lib, _lib);
                return Q.when(info.resources, function (_resources) {
                    update(resources, _resources);
                });
            });
        });
        return done;
    });
}

function mergeRootsIntoTree(fss) {
    var tree = {};
    var done;
    fss.forEach(function (fs) {
        // fetch lists in parallel
        var list = fs.listTree("", function (path, stat) {
            return stat.isFile();
        });
        // merge each fs serially
        done = Q.when(done, function () {
            return Q.when(list, function (list) {
                list.forEach(function (path) {
                    tree[path] = {
                        "fs": fs,
                        "path": path
                    };
                });
            });
        });
    });
    return Q.when(done, function () {
        return tree;
    });
}

function mergeNestedTrees(trees) {
    // merge the resource trees into a single tree
    var merged = {};
    Object.keys(trees).forEach(function (base) {
        var tree = trees[base];
        Object.keys(tree).forEach(function (path) {
            var subtree = tree[path];
            merged[base + "/" + path] = subtree;
        });
    });
    return merged;
}

function enumerateRoots(options) {
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
    return roots;
}

function configure(config, pkg, options) {

    // support overlays
    if (config.overlay) {
        (options.engines || []).forEach(function (engine) {
            update(config, config.overlay[engine] || {});
            config[engine] = true;
        });
        delete config.overlay;
    }

    // support directories
    config.directories = config.directories || {};

    config.directory = function (name) {
        return this.directories[name] || name;
    };

    var dependencies = config.dependencies;
    if (config.lode) {
    } else if (Array.isArray(dependencies)) {
        // narwhal
        throw new Error(
            "Can't load package " + pkg.href +
            " because Narwhal packages are not yet supported"
        );
    } else {
        // NPM
        // Add a .node language
        //
        /*
        var languages = config.languages = config.languages || [];
        languages.push({
            "extension": ".node",
            "require": require
        });
        */
        var NPM = require("./npm");
        dependencies = dependencies || {};
        // construct mappings from dependencies, based on
        // npm-installed packages
        var mappings = config.mappings || {};
        Object.keys(dependencies).forEach(function (dependency) {
            var predicateString = dependencies[dependency];
            mappings[dependency] = NPM.findPackage(
                dependency,
                predicateString,
                options
            );
        });
        // modules TODO
        mappings = Q.shallow(mappings);
        return Q.when(mappings, function (mappings) {
            config.mappings = mappings;
            var includes = config.includes = config.includes || [];
            includes.unshift({
                "capability": "node@0.4"
            });
            return config;
        });
    }

    if (!config.lode)
        throw new Error(
            "Can't load package " + pkg.href +
            " because it is not designed for Lode."
        );

    return config;
}

function Dependency(dependency, name) {
    if (typeof dependency === "string") {
        if (dependency.indexOf("@") >= 0) {
            var parts = dependency.split("@");
            dependency = {
                "name": parts[0] || name,
                "version": parts[1],
                "registry": parts.slice(2).join("@") || undefined
            };
        } else {
            dependency = {"href": dependency};
        }
    }
    return dependency;
}

function visit(linkage, visitors, options) {
    var packages = linkage.packages;
    var done;
    Object.keys(packages).forEach(function (href) {
        var pkg = packages[href];
        if (visitors.package) {
            var join = visitors.package(pkg, linkage, options);
            done = Q.when(done, function () {
                return join;
            });
        }
        if (visitors.module) {
            Object.keys(pkg.lib).forEach(function (id) {
                var module = pkg.lib[id];
                var join = visitors.module(module, pkg, linkage, options);
                done = Q.when(done, function () {
                    return join;
                });
            });
        }
        if (visitors.resource) {
            Object.keys(pkg.resources).forEach(function (path) {
                var resource = pkg.resources[path];
                var join = visitors.resource(resource, pkg, linkage, options);
                done = Q.when(done, function () {
                    return join;
                });
            });
        }
    });
    return done;
}

// initiates the reading of every module and resource's
// content, adding a promise for the content to each linkage
// node and replacing that promise with the resolved value
// eventually.  returns a promise for when all of the
// content nodes are fulfilled.
exports.read = read;
function read(linkage) {
    return visit(linkage, {
        "module": readResource,
        "resource": readResource
    });
}

function readResource(resource) {
    if (resource.fs && resource.path && !resource.content) {
        resource.content = resource.fs.read(resource.path, 'rb');
        return Q.when(resource.content, function (content) {
            resource.content = content;
        });
    }
}

function compile(linkage, options) {
    return visit(linkage, {
        "module": compileModule
    }, options);
}

function compileModule(module, pkg, linkage, options) {
    if (!module.content)
        return;
    if (!module.language) {
        return Q.when(module.content, function (content) {
            module.javascript = content.toString("utf-8");
        });
    } else {
        return Q.when(module.content, function (content) {
            var compiler = requireDependency(module.language.compiler, {
                "fsMemo": options.fsMemo,
                "infoMemo": options.infoMemo,
                "linkageMemo": options.metaLinkageMemo,
                "fs": options.fs,
                "path": options.path,
                "href": options.href
            });
            return Q.when(compiler, function (compiler) {
                module.javascript =
                    compiler.compile(module.content.toString("utf-8"));
            });
        });
    }
}

exports.link = link;
function link(linkage, options) {
    var packages = linkage.packages;
    var requires = {};
    var ready;
    read(linkage);
    return Q.when(compile(linkage, options), function () {
        Object.keys(packages).forEach(function (href) {
            var pkg = packages[href];
            var require = linkPackage(pkg, linkage, requires);
            ready = Q.when(ready, function () {
                return Q.when(require, function (require) {
                    requires[href] = require;
                });
            });
        });
        return Q.when(ready, function () {
            return requires[linkage.main];
        });
    });
}

function linkPackage(pkg, linkage, requires) {
    var config = pkg.config || {};
    var PkgModule = config.requireSecure ?
        require("./secure/init").Module :
        Module;
    var factories = {};

    Object.keys(pkg.lib).forEach(function (id) {
        var module = pkg.lib[id];
        factories[id] = linkModule(module, linkage, requires, PkgModule);
    });

    return Q.when(Q.shallow(factories), function (factories) {

        var require = Require({
            // TODO parameterize the scope
            "scope": {
                "console": console
            },
            "factories": factories,
            "supportDefine": config.supportDefine || config.requireDefine
        });

        return require;

    });
}

function linkModule(module, linkage, requires, Module) {
    if (module.reference) {
        return function () {
            return requires[module.package](module.id);
        };
    } else if (module.javascript !== undefined) {
        return Module(module.javascript, module.href);
    } else if (module.system) {
        return function (scope) {
            update(scope.exports, require(module.system));
        };
    } else if (module.require) {
        return function () {
            return module.require(linkage);
        };
    } else {
        throw new Error(
            "Can't link module " +
            JSON.stringify(Object.keys(module))
        );
    }
}

exports.hash = hash;
function hash(linkage) {
    return visit(linkage, {
        "package": function (pkg) {
            return Q.when(hashPackage(pkg), function (hash) {
                pkg.hash = hash;
            });
        }
    });
}

// requires that the linkage was read
function hashPackage(pkg) {
    var CRYPTO = require("crypto");
    var hash = new CRYPTO.Hash("sha256");
    var alphabet = "0123456789abcdef";
    var done;
    Object.keys(pkg.lib).sort().forEach(function (id) {
        var module = pkg.lib[id];
        done = Q.when(done, function () {
            hash.update(module.content);
        });
    });
    Object.keys(pkg.resources).sort().forEach(function (path) {
        var resource = pkg.resources[path];
        done = Q.when(done, function () {
            hash.update(resource.content);
        });
    });
    return Q.when(done, function () {
        var digest = hash.digest();
        return Array.prototype.map.call(digest, function (n) {
            n = n.charCodeAt();
            return (
                alphabet[(n & 0xF0) >> 4] +
                alphabet[(n & 0x0F) >> 0]
            );
        }).join("").slice(0, 40);
    });
}

exports.verify = verify;
function verify(linkage) {
    return visit(linkage, {
        "package": verifyPackage
    });
}

function verifyPackage(pkg) {
    // TODO, compare hashes of includes, languages, and mappings
}

function regExpEscape(str) {
    return str.replace(/[-[\]{}()*+?.\\^$|,#\s]/g, "\\$&");
};

function isObject(object) {
    return Object(object) === object;
}

function concat(arrays) {
    return Array.prototype.concat.apply([], arrays);
}

function update(target, source) {
    for (var name in source) {
        target[name] = source[name];
    }
}

