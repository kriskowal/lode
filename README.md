
LODE
====

This is an experimental prototype for a new approach to Node
packages, and broadly, to CommonJS JavaScript packages, and
more broadly, to packaging and deploying programs in
general.

Lode is an experiment to provide asynchronously loading
modules both for servers and clients by making packages the
smallest unit of functionality deliverable to a browser and
using the `package.json` of each package to statically link
modules between packages.  Furthermore, Lode is intended to
provide better options for decoupling shared installation of
packages from deployment, particularly for separate
deployment and management of CommonJS packages for use on
the server from those for use on the client.

To use `lode`, install [Node][] and [NPM][]. The use `npm` to
install `lode`.  That will give you a `lode` executable.

[Node]: https://github.com/ry/node

[NPM]: https://github.com/isaacs/npm

    $ npm install lode

Then read the test package to get an idea what to expect and:

    $ lode test

`lode` is an alternate executable that runs CommonJS modules
in packages.  The packages of modules are asynchronously
loaded and statically linked.  `lode` discovers the package
that contains your main module and asynchronously prepares
all of the modules in that package and all of the packages
that that package depends on through declarations in each
package's `package.json` descriptor.

If a package conditionally depends on another package, if
the information for a dependency must be computed at
run-time, or if a package should be loaded later to improve
the performance of the initial load, packages can be
asynchronously loaded at run-time.  Further information on
asynchronously loading packages at run-time appears in the
API documentation (below).

Within a package, `lode` guarantees that a module can only
require other modules that are in the same package or in
packages that are explicitly declared in the `package.json`.
This prevents missing dependencies from going unnoticed.

`lode` supports a new package style, tentatively called Lode
packages.  It is designed to eventually be able to
assimilate other package formats.


The Experiment
--------------

At the time of this writing (early 2011), the CommonJS
community has spent a considerable amount of discussion on
how best to move forward with CommonJS modules for better
interoperability with browsers.  It is clear that some
boilerplate is needed for modules to be efficiently loaded
in modern browsers.  It is also clear that a module's
dependencies need to be known before `require` is called in
a module.

There are several schools of thought at the moment, but in
general we are divided between a simple wrapping of current
CommonJS modules for modules destined for the browser, and
those who favor using RequireJS.

One of the many issues between these two approaches is how
to discover static dependencies.  For those who favor a
simple wrapping of CommonJS modules, the current best option
for discovering static dependencies is static analysis,
scraping the source code of a module for `require` calls.
This is fraught with difficulty.

Instead, Lode imposes strong constraints on what modules are
available within a package by enforcing the linkage
described in `package.json` and affording many good options
for both internal and external linkage.  In the presence of
these constraints, the working set of any module in a
package is a strict subset of the working set of the
containing package.  In the Node ecosystem, packages are
very light, usually providing a single module for its public
API.  By configuring the loader to incorporate module roots
based on the target environment, it is possible for Lode to
construct lighter packages.  Given that packages are light,
it makes sense to take the small risk of bundling packages
with modules that may never be executed, and designing
packages around these constraints for use in browsers.


Lode Packages
-------------

A Lode package supports multiple kinds of inter-package
dependency and can conditionally include module roots within
the package depending on several initialization options.

A package can contain several roots.  Which roots are
incorporated depends on the loader options.  For example, a
a package can be configured for use in web browsers with
provisions for debugging.  If so, a package may provide
alternate modules by providing roots at `debug`,
`engines/browser`, and `engines/browser/debug`.  For
example, a UUID package would use system-specific bindings
on the server-side to achieve the highest levels of entropy,
and would use an implementation based on `Math.random` on
the client-side.  These overrides are particularly useful
since the server-side code would be dead-weight on the
client-side.  The most specific roots have the highest
precedence.

The module name-space of a package is populated from several
sources: the modules contained in its own roots, "mappings",
and "includes".  In order of precedence, they are
"mappings", own modules, and "includes".

Mappings are packages that are included on a sub-tree of the
module identifier space, as configured in the package's
`package.json`.  So, if a package is mapped to `foo` in the
module name space, `require("foo")` would import its main
module and `require("foo/bar")` would import the `bar`
module from the `foo` package.

Includes are packages that are linked in priority-order
under the package's root name space.  These can be used to
provide additional roots to a package, much like
engine-specific roots or debug-specific roots.  Includes are
not merely a syntactic convenience: they are useful for
mixing packages like themes in applications.  Because
included packages can intercept and override each-other's
public name spaces, they are more tightly coupled than
mappings and should be developed in tighter coordination.

Within Lode packages, the `require.paths` variable specified
as optional by the CommonJS/Packages/1.0 specification, is
undefined.  The set of modules available within a package
cannot be manipulated at run-time.

Presently, the `package.json` of a Lode package must
explicitly note that it is a Lode package.

    {
        "lode": true
    }

If a package is not merely a Lode package, but has
configuration properties for other systems, the "lode"
property may be an object that shallowly overrides
individual properties of the configuration.

A package's "main" module may be specified with the `"main"`
property in `package.json`, as a path relative to the
package root, including the file's extension.

    {
        "main": "foo.js"
    }

The package may provide `"includes"` and `"mappings"`
properties.  `"includes"` must be an array of dependencies
and `"mappings"` must be an object that maps module subtrees
to dependencies.

For the time being, dependencies are paths relative to the
package root.  These path properties will probably be
tolerated indefinitely, but eventually an record that
provides various styles of configuration information for the
dependency will be accepted in-place.

    {
        "main": "foo.js",
        "mappings": {
            "bar": "mappings/bar"
        },
        "includes": [
            "includes/baz"
        ]
    }

By default, all modules in a package are publically linked.
The set of public module identifiers can be restricted by
providing a `"public"` array of top-level module identifiers
in the package configuration.

    {
        "public": ["foo", "bar", "baz"]
    }

A package may opt-in to support the RequireJS `define`
boilerplate in modules.

    {
        "supportDefine": true
    }

With this option enabled, modules will have a `define` free
variable.  The `define` function takes a callback as its
last argument that in turn accepts `require`, `exports`, and
`module`.  All other arguments to `define` are ignored, and
the callback is called.  If the callback returns an object,
that object replaces the module's given exports object.

    define(id?, deps?, function (require, exports, module) {
        return exports;
    });

A package may opt-in to make the `define` wrapper mandatory,
in which case failing to call define will cause a module
factory to throw an error.

    {
        "requireDefine": true
    }


Lode Modules
------------

Lode modules have the following free variables:

## `exports`

The public API of the module, which can be augmented or
replaced.  You can replace a module's exports by returning
an alternate object.

Assigning to `module.exports` is a Node-specific extension
to the CommonJS specification.  To embrace existing code,
this practice is presently tolerated in Lode modules, but
may eventually be restricted to a legacy loader for
NPM-style packages.

## `require(id)`

Returns a module given a relative or top-level module
identifier.  A relative module identifier is prefixed with a
"./" or a "../".  Module identifiers may use "." and ".."
terms to traverse the module name space like file system
directories, but ".." above the top of the module name space
("") is not defined and may throw an error.

## `module`

The module meta-data object contains information about the
module itself.  This may include its `id`, `path`,
`directory`, `url`, or a subset thereof depending on where
it comes from.  The `module` object is only guaranteed to
have an `id`

## `require.main`

If a package is loaded with the `lode` executable, or if it
is loaded using the internal API and executed with
`pkg.require.exec(id, scope_opt)`, `require.main` is set to
the `module` object corresponding to that call.  By
convention, you can check whether the module you are
presently in is the main module like:

    if (require.main === module)
        main();

The Node-specific `__filename` and `__dirname` free
variables do not appear in Lode packages.  Also, Lode does
not respect the Node convention that a `foo/index.js` file
gets linked to the module identifier `foo` in place of
`foo.js`.


API
---

The "lode" module contains the following API. Promises
returned by this API conform to CommonJS/Promises/A,B,D, so
they're interoperable with promises from many other
libraries.


## `loadPackage(path, options)`

returns a promise for the package at the given path.  The
path must be a directory containing a `package.json`.  The
returned package object has `identify(path)` and
`require(id)` methods.

## `loadPackageContaining(path, options)`

returns a promise for the package containing the script at
the given path.  A subsequent call to `package.identify` can
ascertain the corresponding module identifier of the script.
If the script is not inside a package, the returned
pseudo-package handles the script as a normal Node module.

## `linkPackage(path, options)`

returns a promise for the full linkage tree of the given
package.  A linkage tree contains all of the involved
packages, identified by their canonical paths, mapped to the
corresponding package data.

Each package descriptor has `path`, `ids`, and `linkage`
properties.  The `path` the unique path of the package.  The
`ids` are all of the public module identifiers, suitable for
linking to other packages.  The `linkage` is a mapping from
top-level module identifiers to module data.

Each module descriptor is either for an internal module or
an external module.

If the module is linked to another package, the descriptor
will have `package` and `id` properties for the
corresponding module.  The `package` property is the unique
path to the package, suitable for indexing off the root
object.

If the module is provided by the containing package, the
descriptor will have `path`, `content`, and `loader`
properties.  The `path` is the canonical path of the file
from which the module comes.  `content` is the text of the
module, regardless of the language it was written in.  The
`loader` is an object that can either `compile` the content
to a factory, `translate` it to JavaScript, or refer to a
package with a suitabe interpreter for either the client or
server-side.

Presently, the only loader available is a JavaScript loader
that handles the `""` and `".js"` extensions of modules and
can only `compile` modules to factories.  Loaders will
eventually be configurable per package.


## `package.require(id)`

Returns the exports of the corresponding module in the
package's name-space.

## `package.require.exec(id, scope_opt)`

Lode packages provide an exec method that permits a record
containing additional free variables to be injected into the
main module of the package.  `exec` creates a new instance
of the package which does not share state with other `exec`
calls.

## `package.identify(path)`

Returns a promise for the module identifier corresponding to
the given path, suitable for passing to `require` on this
package.

## `package.ids`

An array of the module identifiers that this package
exposes.  This is used internally for statically linking the
package in another package.

## `options.engines`

An optional array of engine names.  The corresponding engine
roots (directories like `package/engine/browser`) will be
incorporated into the package, superceding any files in the
main package root.

## `options.debug`

If true, the given package will incorporate `debug` roots
from any other root.


Glossary
--------

- autonomous: a property of some module systems where a
  module, package, or name-space provides its own name and
  thus is tightly coupled to that name both internally and
  to other modules, packages, or name-spaces.  CommonJS
  modules are not autonomous.  RequireJS permits modules to
  be optionally autonomous, by way of the `define` call, so
  that they can be bundled.  The Simple Modules strawman for
  ECMAScript Harmony allows modules to be autonomous within
  a file, but the top scope of a loaded module must be named
  in the loading module, so both concepts are supported.
- bundle: a JavaScript file that can be downloaded and
  executed by a web browser using script-injection to
  asynchronously load one or more modules or packages of
  modules.  Lode does not presently provide a bundling
  feature, but it is in the design.
- catalog: a file on the web that describes a set of
  packages.  Using a catalog reference in a package
  configuration provides a level of indirection and permits
  a package to be loosely coupled to its dependencies,
  allowing the catalog to be updated independently of the
  package.
- compile: to transform a module in a source language, like
  CoffeeScript, and produce JavaScript.
- context: a JavaScript execution context is a container in
  which a JavaScript event-loop can be executed,
  guaranteeing that the array and object literal
  constructors produce instances with the same particular
  constructors, and providing the same primordial references
  and global scope to all events.
- cross-domain: in a web browser, a URL that has a different
  domain than the containing page.  Web browsers impose
  restrictions on JavaScript's ability to interact with
  cross-domain resources (as in limiting the ability to use
  an XMLHttpRequest), and for an iframe's ability to
  interact with the containing frame's JavaScript
  references.
- define: a function name used by RequireJS and some
  CommonJS proposals to permit a hand-written module to be
  loaded with script-injection.  `define()` boilerplate,
  where the last argument is a callback that receives
  `require`, `exports`, and `module` as arguments, is
  accepted by Lode to encourage interoperability with code
  targetting RequireJS, but the dependency array and
  optional module identifier arguments are ignored.
- dependencies: particuarly package dependencies, including
  mappings, includes, and eventually alternate module loader
  packages.  In a package configuration, dependencies are
  uniformly represented by the right-hand side of a
  `mappings` item, and the contents of an `includes` array.
- engine: A JavaScript embedding like NodeJS (`"node"`),
  Rhino (`"rhino"`), an arbitrary web browser (`"browser"`),
  or a particular web browser.  Engines provide different
  classes of functionality so packages can be provided
  alternate modules for different engines.
- entry-point: the first module executed in an instance of a
  working-set of packages and modules.  The entry-point is
  determined by the `id` in `pkg.require.exec(id)`.
- exports: the public API of a module, represented as a
  free-variable in a module, or returned by a module.
- extension: the part of a file-name after the last dot,
  `"."`, that is presently the only mechanism for
  communicating to a loader whether and how a module file
  should be loaded or compiled.
- factory: a function that executes a module.  Module
  factories are called by a module loader on the first
  occasion a module is required.  Having a factory permits a
  module to be executed or instantiated independently of
  loading.
- free variable: a variable that is not bound in a lexical
  scope and presumed to be inherited from a parent scope,
  like the primordials, and other variables injected into
  modules like `require` and `exports`.
- identifier: a string that corresponds to a module in the
  module-name space of a package.  Identifiers are
  lower-case names using hyphens to delimit words, organized
  into subtrees with slash, `"/"`, delimiters.  Identifiers
  are either top-level or relative depending on whether or
  not they begin with one of `"./"` or `"../".
- include: a type of dependency that gets "mixed-in" with
  the module name space of the containing package.
- library: a directory called `"lib"` by convention in any
  of a package's roots containing modules and directories of
  modules that get inducted into the top-level module
  name-space of a package.
- link: a module identifier in one package that corresponds
  to a module identifier in a dependency package.
- load: as distinct from execution, loading asynchronously
  provides a module factory to a loader, sometimes for a
  single module, sometimes as part of a bundle of modules or
  packages.  Only when all of the modules and packages in a
  working-set have been loaded can any module in that
  working set be executed because a `require` call in any
  module must be able to return the exports of the requested
  module in the same turn of the event-loop.
- loader options: an object that configures a module loader
  to use particular roots in each of the loaded packages,
  for example, for debug mode in a browser, or for
  deployment in Node.  Different options result in different
  modules being used if a package provides alternate
  versions of modules.
- loader: a device that asynchronously loads packages and
  modules, permitting them to eventually be synchronously
  executed.
- main (package configuration): in the context of a
  particular package, the main module is identified by `""`.
  Whether a package has a main module and what file
  corresponds to the main module identifier is the `"main"`
  property of the package's configuration.
- main (require): In the context of executing a package, the
  `"main"` module is the entry-point for the execution of a
  working-set of packages and modules.  In the scope of any
  module, `require.main` is the `module` object in the scope
  of the main module.
- mapping: a kind of dependency where the top-level module
  name-space of an external package gets integrated into a
  sub-tree of the dependent package's name-space.
- module: a file that has its own, sovereign lexical scope
  and may require and provide exports from and to other
  modules using the `require` and `exports` free variables,
  and the `return` statement.  A module receives a `module`
  free variable with meta-data like the module's identifier.
- name-space: the module identifier name-space is a set of
  top-level identifiers scoped to a package, where some
  identifiers are linked to modules within the package, and
  others to dependency packages.
- package configuration: the `package.json` of a package,
  containing its configuration information, particularly how
  it should be linked to other packages and described to
  package registries and catalogs.
- package: a directory or archive of a directory with a
  package configuration file at its root (`package.json`),
  various roots, libraries within roots, and modules within
  libraries.
- primordial: any of the objects intrinsic to a context like
  the global object and `Object` and `Array` constructors.
- public: the set of top-level module identifiers from one
  package that are linked to a dependent package either
  through mappings or includes.  By default, all modules in
  a package, including their includes and mappings, are
  publically linked, but the list of publically linked
  identifiers can be restricted with the `public` property
  in the package configuration.
- registry: a web service for searching, downloading, and
  posting packages.
- relative: a class of module identifier that begins with
  `"./"` or `"../"` indicating that the corresponding module
  should be resolved relative to the current module's
  top-level identifier.
- require: a function provided as a free-variable to
  CommonJS modules that permits the module to acquire the
  exports of another module.
- root: the top-most directory of a package is the `root`,
  but there may be others depending on the loader options,
  for example, including the `{root}/engines/{engine}`
  directory of any other root and configured engine name
  like `node` or `browser`, and the `{root}/debug` directory
  of any other root if a loader is configured for debugging.
  Roots are prioritized from most to least specific and
  searched for resources, particularly but not limited to
  library directories where modules are found.
- script-injection: a technique for asynchronously
  downloading and executing potentially cross-domain
  JavaScript in a web browser.
- SES5: secure ECMAScript 5 is a subset of ECMAScript 5 (a
  specification for the class of languages including
  JavaScript) where all of the primordials are immutable (by
  virtue of being frozen) and other invariants are
  maintained to prevent the lexical scope and primordials in
  any event from being suberted by another event, and to
  permit mutually suspicious programs to run in the same
  event loop without interference except possibly
  denial-of-service.
- sovereign: pertaining to a lexical-scope, means that a
  module is not coupled to other modules using a shared
  lexical scope, and thus is safe from contamination and
  pollution of other modules.  CommonJS modules have
  sovereignty over their lexical scope.  Pertaining to the
  module identifier-name space, means that a package is not
  implicitly coupled to other packages, using a shared
  package name-space, and thus is safe from contamination
  and polution of other packages.  Lode packages have
  sovereignty over their module name-space, but may elect to
  be coupled to specific packages through includes and
  mappings.  Node packages do not have sovereignty; they are
  subject to the module identifier name-spaces provided to
  them by Node and other packages.  NPM makes an effort to
  guarantee consistent linkage to dependencies, but does not
  provide sovereignty.  Narwhal packages do not have
  sovereignty; they are subject to the module identifier
  name spaces of all installed packages.
- top-level: as distinguished from "relative", a top-level
  module identifier is one that does not start with a `"./"`
  or a `"../"`, indicating that a module is linked relative
  to the root of the module name-space, `""`.
- turn: the execution of an event in JavaScript. The
  JavaScript event-loop arranges for events to be execute
  din turns, with only one stack of execution at any time.
- working set: given a package, the transitive closure of
  all packages that any package in the set depends upon.
  Given a module, the transitive closure of all modules that
  any module in the set requires.  Because `require` must be
  able to return an `exports` object in the same turn, and
  if loading must be asynchronous, the working set of
  CommonJS modules must be loaded before any module in the
  working set is executed or instantiated.  Lode is an
  asynchronous module loader, and for Lode, the working set
  of modules is guaranteed to be a subset of the working set
  of packages, so it is not necessary to browse the source
  of each module to determine its static dependencies.


Future
------

Lode is a humble beginning to an ambitious ecosystem of
projects.

Dependencies will be expressible in `package.json` with an
object that notes various kinds of information depending on
the degree and kind of coupling that the package author
intends.

- For example, it will be possible for a package to denote
  the location of an archive on the web from which the
  dependency may be downloaded.
- Alternately, a version control repository URL might be
  provided so it can be downloaded for editing.  If a "path"
  is also provided, `lode` will have the option of placing
  the package at that path so it may be edited in place.
  Without the "path", `lode` would have the option of
  downloading it and running it in memory.
- `lode` might opt to use a hashing algorithm to verify the
  signature of a package if the hash is provided.  This is
  particularly useful for verifying that the version that is
  online corresponds to the downloaded version with which
  the package has been tested.
- Alternately, levels of indirection between the dependency
  and the archival download URL might be introduced using a
  catalog or registry URL, a package name, and a version,
  version range, version predicate, or semantic version.
- Alternately, the package might elect to allow `lode` to
  provide a suitable implementation of a specification or
  embedding API version, using a URL.  This would permit the
  engine to provide stubs for deprecated APIs in a separate
  container than its clean, stable API.

It will be possible to use `lode` to build a stand-alone
executable for a package.

It will be possible to specify in `package.json` that
particular file extensions in that package should be loaded
or compiled to JavaScript with an alternate loader, provided
by a given package.  If the modules in question are being
delivered to a browser, it will be necessary for the loader
to either compile the language to JavaScript on the
server-side or provide an interpreter to run the code on the
client side.  If the interpreter is needed, Lode will bundle
the loader package for use on the client.

It will be possible for packages to be hosted or bundled for
use in web browsers, for either development or deployment.
It will be possible to use alternate roots for deployment
which may in turn contain alternate configuration.  It is my
hope to leverage Gozala's [Teleport][] package for this
purpose, and to use Q-JSGI and Q-HTTP as at least an option
for the server.  I also hope to leverage of Joe Walker's
[Dry Ice][].

[Teleport]: https://github.com/Gozala/teleport

[Dry Ice]: https://github.com/mozilla/dryice

It will be possible to configure a package so that all of
the modules in that package receive particular free
variables from a package, like Node's "process" and
"console" free variables.  These must be decoupled from the
global object so they do not leak ambient authority to
sandboxed code in the same context.

It will be possible for a package to elect that it be run in
a secure subset of JavaScript, SES5, where all of the
primordials are frozen and capabilities must be explicitly
injected into sandboxed packages.  Other packages will be
able to note that they are able to run in SES5.

Packages will be able to explicitly declare in
`package.json` which modules in their module-name space
should be statically linked by mappings and includes.
Whether this will be mandatory remains undecided.

It will be possible to load and mix Narwhal packages and
both old and new NPM package styles.  NPM is in the process
of altering its API such that "lib" roots and "modules"
declarations are no longer respected.

The loader API will provide a means to get the JavaScript
content and other resources in a working set of packages, so
additional tools can be built to provide alternate
deployment systems.

I will probably need help with this.


History
-------

There have been many experiments in package management, in
general, in JavaScript, and in CommonJS.  NPM for Node by
Isaac Schlueter, Nodules by Kris Zyp, and my own Tusk for
Narwhal are two of those experiments.  They all are
variations on the CommonJS/Packages/1.0 specification.  The
specification does not provide insight into how modules in
packages are linked because there is still a lot of room for
experimentation.

NPM takes the approach that the package manager should
interact with the engine (Node) solely by manipulating the
file system.  As a stopgap, it also provides shims that push
and pop paths on the `require.paths` so that each package
gets a different view of the module name-space.  About this,
I believe that the only disagreement among members of the
Node community is whether the hack is egregious or merely
tolerable.

Narwhal and Tusk are decoupled slightly differently.
Narwhal performs a search for installed packages when it
starts. Tusk, like NPM, only fiddles with the filesystem.
However, Narwhal conflates the module name spaces of all
installed packages and has to find all of the installed
packages before running.  Lode only looks at packages that
are used by the package that contains the main module, and
while the conflated name space is useful, it provides the
mappings approach as a safer coupling system.

NPM favors an approach to package management more similar in
spirit to "mappings" and Narwhal favors one more conducive
to "includes".  Kris Zyp's Nodules is written exactly to the
CommonJS Mappings specification. Lode provides both since
they both have their limitations.

Lode does not yet conform to the CommonJS/Mappings/C
specification.  I haven't decided whether it will.


License
-------

Copyright 2009, 2010 Kristopher Michael Kowal
MIT License (enclosed)

