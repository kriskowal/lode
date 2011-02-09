
LODE
====

This is an experimental prototype for a new approach to Node
packages, and broadly, to CommonJS JavaScript packages, and
more broadly, to packaging and deploying programs in
general.

To use `lode`, install `node` and `npm`. The use `npm` to
install `lode`.  That will give you a `lode` executable.

    https://github.com/ry/node

    https://github.com/isaacs/npm

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

Lode is an experiment to provide asynchronously loading
modules both for servers and clients by making packages the
smallest unit of functionality deliverable to a browser and
using the `package.json` of each package to statically link
modules between packages.  Furthermore, Lode is intended to
provide better options for decoupling shared installation of
packages from deployment.


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

The package may provide "includes" and "mappings"
properties.  "includes" must be an array of dependencies and
"mappings" must be an object that maps module subtrees to
dependencies.

For the time being, dependencies are paths relative to the
package root.  These path properties will probably be
tolerated indefinitely, but eventually an record that
provides various styles of configuration information for the
dependency will be accepted in-place.


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
variables do not appear in Lode packages.


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

It will be possible to provide hooks for running modules in
other languages, or compiling them to JavaScript so that
they can be used in browsers.

It will be possible for packages to be hosted or bundled
for use in web browsers, for either development or
deployment.  It will be possible to use alternate roots for
deployment which may in turn contain alternate
configuration.  It is my hope to leverage Gozala's Teleport
package for this purpose, and to use Q-JSGI and Q-HTTP as at
least an option for the server.

It will be possible for different types of packages to
receive alternate free-variables like Node's "process" and
"console".  These must be decoupled from the global object
so they do not leak ambient authority to sandboxed code in
the same context.

It will be possible for a package to elect that it be run in
a secure subset of JavaScript, SES5, where all of the
primordials are frozen and capabilities must be explicitly
injected into sandboxed packages.

Packages will be able to explicitly declare in
`package.json` which modules in their module-name space
should be statically linked by mappings and includes.
Whether this will be mandatory remains undecided.

With an explicit declaration in `package.json`, modules with
client-side boilerplate for systems like RequireJS will be
tolerated.

It will be possible to load and mix Narwhal packages and
both old and new NPM package styles.  NPM is in the process
of altering its API such that "lib" roots and "modules"
declarations are no longer respected.


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
