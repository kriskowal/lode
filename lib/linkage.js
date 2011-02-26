
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

var Q = require("q/util");
var URL = require("url"); // node
var FS = require("q-fs");
var MOCK = require("q-fs/mock");
var Mock = MOCK.Fs;
var Root = require("q-fs/root").Fs;
var Module = require("./module").Module;
var PFS = require("./fs");

function Dependency(dependency) {
    if (typeof dependency === "string")
        dependency = {"href": dependency};
    return dependency;
}

exports.loadLinkage = loadLinkage;
function loadLinkage(rootDependency, options) {
    return Q.when(loadPackageLinkage(rootDependency, options), function () {
        return Q.when(Q.deep(options.linkageMemo), function (memo) {
            return {
                "packages": memo
            }
        });
    });
}

function loadPackageLinkage(dependency, options) {
    dependency = Dependency(dependency);
    var linkage = options.linkageMemo = options.linkageMemo || {};
    if (dependency.archive !== undefined && dependency.href === undefined) {
        dependency.href = dependency.archive;
    }
    if (dependency.system !== undefined) {
        var href = "system:" + dependency.system;
        return linkage[href] = {
            "href": href,
            "ids": [""],
            "lib": {
                "": {
                    "system": dependency.system
                }
            },
            "resources": {}
        }
    } else if (dependency.capability !== undefined) {
        var href = "capability:" + dependency.capability;
        return linkage[href] = {
            "href": href,
            "ids": [""],
            "lib": {
                "": {
                    "capability": dependency.capability
                }
            },
            "resources": {}
        }
    } else if (dependency.href !== undefined) {
        var info = loadPackageInfo(dependency, options);
        return Q.when(info, function (info) {
            if (!linkage[info.href]) {

                linkage[info.href] = Q.when(info.config, function (config) {

                    var suboptions = Object.create(options);
                    suboptions.fs = info.fs;
                    suboptions.path = info.path;
                    suboptions.href = info.href;

                    // scope
                    var scope = config.scope = config.scope || [];
                    scope = Q.ref(scope.map(function (scope) {
                        return loadPackageLinkage(scope, suboptions);
                    }))
                    .then(Q.shallow)
                    .then(function (scope) {
                        return scope.map(function (scope) {
                            return scope.href;
                        });
                    })

                    var lib = {};
                    var resources = {};

                    // get the included packages
                    var ready = loadDeepIncludes(info, lib, resources);
                    return Q.when(ready, function () {
                        return Q.when(scope, function (scope) {
                            return {
                                "href": info.href,
                                "path": info.path,
                                "fs": info.fs,
                                "ids": config.public || Object.keys(lib),
                                "lib": lib,
                                "resources": resources,
                                "scope": scope
                            };
                        });
                    });

                });
            }
            return linkage[info.href];
        });
    } else {
        throw new Error("Can't load package " + JSON.stringify(dependency));
    }
}

exports.loadPackageInfo = loadPackageInfo;
function loadPackageInfo(dependency, options) {
    options = options || {};
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
                    return Q.when(fs.read("package.json"), function (content) {
                        var config =  JSON.parse(content);

                        var suboptions = Object.create(options);
                        suboptions.fs = got.fs;
                        suboptions.path = got.path;
                        suboptions.href = got.href;

                        // loaders
                        var loaders = config.loaders || [];
                        loaders = Q.ref(loaders.map(function (loader) {
                            var pkg = loadPackageLinkage(loader.package, suboptions);
                            return {
                                "extension": loader.extension,
                                "package": pkg
                            }
                        })
                        .concat([
                            {"extension": ""},
                            {"extension": ".js"}
                        ]))
                        .then(Q.shallow)

                        // mappings
                        var mappings = config.mappings = config.mappings || {};
                        var map = {};
                        Object.keys(mappings).map(function (key) {
                            var mapping = mappings[key];
                            map[key] = loadPackageLinkage(mapping, suboptions);
                        });
                        // begin preparing these in parallel with the lib
                        // preparation, then join toward the end of that
                        // section
                        mappings = Q.deep(map);

                        // includes
                        var includes = config.includes = config.includes || [];
                        includes = includes.map(function (include) {
                            return loadPackageInfo(include, suboptions);
                        });
                        includes = Q.shallow(includes);

                        // lib (code)
                        var lib = Q.when(config, function (config) {
                            return Q.ref(roots.map(function (root) {
                                var path = fs.join(root, 'lib');
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
                                    return Root(fs, root);
                                });
                            })
                            .then(Q.shallow)
                            .then(function (roots) {
                                return roots.map(function (root) {
                                    var list = root.listTree("", function (path, stat) {
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
                                                "href": got.href + '/' + path,
                                                "fs": Object.create(root),
                                                "path": path,
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
                                if (config.main) {
                                    var extension = fs.extension(config.main);
                                    tree[""] = tree[""] || {};
                                    tree[""][extension] = {
                                        "fs": fs,
                                        "path": config.main,
                                        "id": "",
                                        "extension": extension
                                    }
                                }
                                roots.forEach(function (root) {
                                    update(tree, root);
                                });

                                return Q.when(loaders, function (loaders) {
                                    // elect a loader for each extension
                                    var elections = {};
                                    Object.keys(tree).forEach(function (id) {
                                        var candidates = tree[id];
                                        for (var i = 0, ii = loaders.length; i < ii; i++) {
                                            var loader = loaders[i];
                                            if (candidates[loader.extension]) {
                                                var election = candidates[loader.extension];
                                                if (loader.package !== undefined)
                                                    election.loader = loader.package.href;
                                                elections[id] = election;
                                                break;
                                            }
                                        }
                                    });
                                    return elections;
                                });
                            })
                        })
                        .then(function (tree) {
                            // merge the mappings trees
                            return Q.when(mappings, function (mappings) {
                                Object.keys(mappings).forEach(function (key) {
                                    var mapping = mappings[key];
                                    var lib = mapping.lib;
                                    var ids = mapping.ids;
                                    ids.forEach(function (id) {
                                        tree[fs.join(key, id)] = {
                                            "external": true,
                                            "package": mapping.href,
                                            "id": id
                                        };
                                    });
                                });
                                return tree;
                            });
                        })

                        // resources
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
                                                // XXX race condition
                                                files[root] = {
                                                    "fs": Object.create(fs),
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

                        return {
                            "href": got.href,
                            "path": got.path,
                            "fs": Object.create(got.fs),
                            "config": config,
                            "lib": lib,
                            "resources": resources,
                            "includes": includes
                        };

                    });

                });
            }
            return memo[got.href];
        });

    } else {
        throw new Error("Can't load dependency: " + JSON.stringify(dependency));
    }
}

function loadDeepIncludes(info, lib, resources, included) {
    included = included || {};
    if (included[info.href])
        return;
    return Q.when(info.includes, function (includes) {
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
                        "fs": Object.create(fs),
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

function concat(arrays) {
    return Array.prototype.concat.apply([], arrays);
}

function regExpEscape(str) {
    return str.replace(/[-[\]{}()*+?.\\^$|,#\s]/g, "\\$&");
};

function update(target, source) {
    for (var name in source) {
        target[name] = source[name];
    }
}

