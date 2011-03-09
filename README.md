
LODE
====

Lode is a JavaScript module system built on Node and
CommonJS designs, using packages and statically linking
modules across and within packages at load-time.

* Lode does not install packages on the local file system,
  nor does it require packages to be installed.  If they are
  on the local file system, it can use them, but it's just
  as well if they're on the web and `lode` is run by
  `nobody`.  You can think of Lode as a JavaScript
  application web agent.
* On the server-side, Lode asynchronously loads and
  statically links all of the modules in a working set of
  packages before they are either executed or distributed.
* Packages have absolute control over their module
  name-space, and must explicitly refer to other packages in
  their `package.json` for those packages to be available.
  No more missing dependencies when packages are published.
* Packages can be loaded from ZIP files over HTTP or HTTPS
  in addition to local file system directories or ZIP files.
  Package dependencies are ultimately URL's.
* Lode can use compiler packages at load-time, like
  CoffeeScript, obviating the need for a build-step.
* Lode packages can be composed with other packages using
  `"includes"` and `"mappings"`.
* Lode packages can contain and access their own static
  resources, like HTML fragments.
* Lode is designed to allow packages to provide alternate
  modules and resources depending on various modes, like
  debug, on the browser versus the server, or alternate
  embeddings, engines, or platforms.
* Lode can link some NPM packages without alteration, and
  provides the same strict linkage as other Lode packages,
  meaning that missing dependencies in NPM packages can be
  detected by running them with Lode.
* Lode contains an API that permits package linkage and
  content to be inspected by third-party tools, like
  documentation, lint, and build tools.

Soon:

* Lode can either build or host packages for use in web
  browsers.
* Lode can verify and update the hashes of dependencies, and
  can use those hashes as cache keys, both on the
  server-side and the client-side.  Packages can be hosted
  on CDN's with far-future expiration dates.
* Lode can determine, based only on information in
  `package.json` files, whether a package can be used
  server-side, client-side, or both.


Gettings Started
----------------


### Using Git and Activate

    $ git clone git://github.com/kriskowal/lode.git
    $ cd lode
    $ source bin/activate


### Using Node and NPM

Install [Node][] and [NPM][]. The use `npm` to install
`lode`.  That will give you `lode`, `lodown`, and `bilde`
executables.

[Node]: https://github.com/ry/node

[NPM]: https://github.com/isaacs/npm

    $ curl http://npmjs.org/install.sh | sh
    $ npm install lode

To have any fun in the tryouts section, you'll also need a
copy of the test.zip, which you can find in the NPM packages
directory (have fun), or just try the last example where
Lode runs it directly off the web.


### Tryouts

Then read the test package to get an idea what to expect and:

    $ lode test
    $ lode test.zip
    $ lode https://github.com/kriskowal/lode/raw/master/test.zip

`lode` is an alternate executable that runs CommonJS modules
in packages.  The packages of modules are asynchronously
loaded (from files or the web) and statically linked.  `lode`
discovers the package that contains your main module and
asynchronously prepares all of the modules in that package
and all of the packages that that package depends on through
declarations in each package's `package.json` descriptor.

You can look at the static linkage of any package, including
NPM packages, by running `lodown`:

    $ lodown test.zip
    {
        "main": ".../test.zip#/",
        "capabilities": [...]
        "packages": {...},
        "warnings": [...]
    }

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
packages, supports CommonJS [Mappings/C][] (with the
exception of the optional `"location"` properties) and can
also run some NPM packages, particularly NPM packages that
were built with the now-deprecated `"modules"` mapping.

[Mappings/C]: http://wiki.commonjs.org/wiki/Packages/Mappings/C


Guide
-----

A package is a directory, optionally archived in zip format,
that contains scripts, resources, and configuration.
Packages can be linked to other packages through its
configuration.


### My First Package

Your first package, `foo`, will start with a CommonJS
"main" module.  You'll need to create this file, and note
that it is your package's main module in the package
configuration.

`foo/main.js`

    console.log("Hello, World!");

`foo/package.json`

    {"main": "main.js"}

Now you can execute `main.js` with Lode.

    $ lode foo/main.js
    Hello, World!


### The Library

Your package can contain other modules.  These modules must
be in the `lib` directory of the package root.  Lode
discovers and statically links all of the modules in your
package's `lib` directory so that they can be required
without blocking IO.  Add a `foo` library to your package by
creating a `foo/lib/foo.js` module.

    console.log("Hello from Foo!");

Then revise your `foo/main.js` to `require` that module from the
library.

    require("foo");

Leaving your `foo/package.json` alone.

    {"main": "main.js"}

And run Lode again.

    $ lode foo
    Hello from Foo!


### Linking Packages

So far, in this package, you can only `require("foo")` to
get the exports of `foo/lib/foo.js`, and `require("")` to
get the exports of the `foo/main.js` module.  The empty
string is the module identifier for the main module in any
package.

In any package, you can only `require` the modules that are
in that package or in the packages that your package depends
upon.  Let's create another package, `bar` with a
`bar/package.json`.

    {"main": "main.js"}

And a `bar/main.js`.

    exports.hello = function (who) {
        console.log("Hello,", who + "!");
    };

This package provides a main module that can say, "Hello",
to anyone.  Since we want to use this package in the foo
package, we need to add a URL to `foo/package.json`.

    {
        "main": "main.js",
        "mappings": {
            "bar": "../bar"
        }
    }

Now we can use `bar` in `foo`.

`foo/main.js`:

    var BAR = require("bar");
    BAR.hello("World");

Then we can run `foo` again with Lode.

    $ lode foo
    Hello, World!


### Archiving a Package

We can also archive our packages and put them on the web.
Let's put `bar` in a `.zip` file and put it in `foo`.

    $ mkdir foo/mappings
    $ find bar | xargs zip mappings/bar.zip

Then we edit `foo/package.json` to use the zip file instead
of the directory.

`foo/package.json`:

    {
        "main": "main.js",
        "mappings": {
            "bar": "mappings/bar.zip"
        }
    }

We can then archive `foo.zip` and put it on the web, even
on an `https://` SSL URL, and run it directly with Lode.

    $ lode https://example.com/foo.zip
    Hello, World!

`/!\` Note that using SSL alone does not make it possible to
run suspicious packages from arbitrary URL's.  It is also
necessary to attenuate authority, rigidly isolate modules to
their lexical scopes, prevent modules from eaves-dropping on
globally provided constructors, and to verify the hash
digest of the package in question to prevent a
man-in-the-middle from usurping `example.com`'s DNS entry
and providing an alternate package.  All of these
requirements are in the scope of Lode's design, but none of
them are yet implemented.


### Using Node's API

Lode gives your `package.json` absolute control over what
module identifiers mean in all the modules in your package.
In the same sense that it is possible to trace all of the
free variables in a lexically scoped module, it is possible
to trace all module identifiers to `package.json`.  With
other systems, your package would share its module
identifier name-space with all other installed packages.
The drawback to Lode's approach is that the `package.json`
must be very explicit.  The advantage is that you can
determine easily, through analysis of all package.json files
for all of the packages linked in a working set, whether a
package will be usable in a variety of environments.  If a
package depends on Node's file system API, that must be
noted in a `package.json`, thus we can easily determine that
the package will not work in a browser.

Let's implement Node's example "Hello, World!" server,
`hello/main.js`.

    var HTTP = require('node/http');
    HTTP.createServer(function (req, res) {
        res.writeHead(200, {'Content-Type': 'text/plain'});
        res.end('Hello World\n');
    }).listen(8124, "127.0.0.1");
    console.log('Server running at http://127.0.0.1:8124/');

To make this possible, we will need to bring Node's API's
into our package's module name space.  Instead of depending
on another package by URL, we'll add a dependency to a
capability of the running engine, in this case Node at
version 0.4, in `hello/package.json`:

    {
        "main": "main.js",
        "mappings": {
            "node": {"capability": "node@0.4"}
        }
    }

Now we can run the server:

    $ lode hello
    Server running at http://127.0.0.1:8124/
    ^C


### Using CoffeeScript

There are several ways you can write your `package.json` to
add support for compiling `.coffee` files to JavaScript at
link time.

You can install it with NPM and use the pseudo-registry
`"npm"` to grab it from whereever it was installed (Lode
will find it, using `.npmrc` if necessary).

    $ npm install coffee-script

Then add a link to `package.json`:

    {
        "main": "main.coffee",
        "languages": {
            ".coffee": "coffee-script@1.0.1@npm"
        }
    }

You can use NPM's version predicates if you want.

Or you can just download it and put it somewhere near your
package.

    {
        "main": "main.coffee",
        "languages": {
            ".coffee": "languages/coffee.zip"
        }
    }

From there, any script with a `.coffee` extension, either
the `main.coffee` or in `lib`, will get implicitly compiled.

    console.log "Hello, Coffee!"

Then run it:

    $ lode main.coffee


Philosophy
----------

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
dependency and each package can be composed from several
layered directory trees ("roots") depending on
several conditions, like whether the package is being used
in development or production, and whether the package is
being used in a web page, browser extension, or server-side
JavaScript embedding.


### Composition

A package can contain several roots.  Which roots are
incorporated depends on the loader options.  For example, a
package can be configured for use in web browsers with
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
"mappings", own modules, and "includes".  All relative
module identifiers are computed relative to the module
name-space, not the file-system name-space from which they
are derrived, so a relative module identifier can traverse
into mappings and includes.

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
as optional by the CommonJS/Packages/1.0 specification, does
not exist.  The set of modules available within a package
cannot be manipulated at run-time.


### Dependencies

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

    {
        "main": "foo.js",
        "includes": [
            "https://example.com/baz.zip"
        ],
        "mappings": {
            "bar": "mappings/bar",
            "resources": {"capability": "resources"}
        }
    }

There are presently three styles of dependency:
inter-package dependency, capability dependency, and system
dependency.  All dependencies can be expressed with an
object with various properties, but inter-package
dependencies can be simple URL strings.


#### Inter-package Dependency

A package dependency has an `href` URL property that refers
to another package by its URL relative to the current
package.  Since URL's are a strict super-set of Unix paths,
a relative path will suffice for the `href` if the other
package is on the same file system (including file systems
inside archives).  Dependency packages can be simple
directories if they are on the same file system, or can be
zip files either on the same file system or on the web.  If
a package is on the web, both "http" and "https" (for SSL)
protocols are supported.

A package dependency may also have a `hash` property with
the first 40 hexidecimal characters of the SHA-256 hash of
the package's modules and resources, digested in sorted
order respectively from their byte buffers.  These hashes
are intended to be eventually used to verify that the
version of a dependency matches the expected version, as a
cache key so packages can be retrieved from a cache of
compiled packages, and as a URL for versioned packages
hosted from CDN's.

Package dependencies will also eventually support an
additional property that will permit Lode to alternately
fetch a package from the web or use a local copy in a
specified relative location.  This will be useful for
development and publishing new packages.


#### Capability Dependency

A capability dependency has a `capability` property with the
name of a capability provided by the host system.
Capabilities must be explicitly injected by the container to
give a package permission to use authority-bearing API's
like access to a file-system or browser chrome.  They're
also useful for bringing in packages that can't otherwise be
optained by downloading another package.

For example, the `"package@0"` capability brings in the
package introspection capability, that gives a package
access to its own bundled resources.

`foo/package.json`:

    {
        "main": "main.js",
        "resources": [
            "package.json",
            "data"
        ],
        "mappings": {
            "self": {"capability": "package@0"}
        }
    }

`foo/main.js`:

    var self = require("self");
    var config = self.read("package.json", "utf-8");
    console.log(JSON.parse(config));

This is useful for including templates and similar
resources.  All resources are loaded asynchronously before
execution, so take care to only include as many as you are
willing to pay at load-time.  The resource tree is
constructed by overlaying the resource trees of included
packages, so, for example,  packages can mix and match
resources for themes.  If a resource overrides a resource
from another package, the overridden resource will not
be read, so it won't contribute to the load-time of the
package.

Another capability that a package can request in Lode on the
server-side is access to Node's internal API's.  The
`capability` property of the dependency must note that it
requires the `node@0.4` API and add this as a mapping to
package configuration.

    {
        "mappings": {
            "node": {"capability": "node@0.4"}
        }
    }

A package can also opt to "include" the Node API's in its
own module name-space.  This is what Lode does internally
when loading packages that were designed for NPM, in
addition to translating the NPM `"dependencies"` array into
`"mappings"` to the locally installed NPM packages.

    {
        "includes": [
            {"capability": "node@0.4"}
        ]
    }

It is my intent to create more and finer-grain capabilities,
and an API and perhaps a user-interface for mediating
capabilities for suspicious packages.

There is not yet any mechanism for white-listing
capabilities that a package is (and its dependencies are)
permitted to use, but you can get a summary of the
capabilities that a package requires by reading the linkage
information for that package.

    $ lodown <url>
    {
        "href": ...,
        "capabilities": [
            "node@0.4"
        ],
        ...
    }


#### System Dependency

A system dependency has a `system` property with the name of
a module provided by the host system.  System dependencies
are a stop-gap that allows Lode to use code that has been
installed into Node's `require.paths` with other systems
until it is able to load most packages on its own, and until
all packages that have to be installed on the local system
can be exposed to packages through capabilities instead.

    {
        "mappings": {
            "system": "coffee-script"
        }
    }

Lode does not attempt to install system dependencies, so if
they are not available, they will cause run-time errors.


### Alternate Languages

A package can specify another package as the provider of a
compiler for alternate source-code languages.  The compiler
package must provide a main module with a `compile(text)`
function that returns JavaScript.  Compilers are prioritized
and selected based off of the existence of a file with a
matching extension.

    {
        "languages": {
            ".coffee": "languages/coffee-script"
        }
    }

This gets translated internally into an array of language
records, each with an `extension` property and another
property describing how to handle the language, in this
case, using the bundled CoffeeScript compiler package.  The
default handler, if none is provided, is the standard
JavaScript module loader.  It may eventually be possible to
bundle a package with an interpreter dependency.

    {
        "languages": [
            {
                "extension": ".coffee",
                "compiler": "languages/coffee-script"
            }
        ]
    }

If a single package root provides multiple files for which
there are matching language extensions, the package linkage
will contain a warning in its `warnings` property indicating
that there were multiple candidates for the given module
identifier, and which one was elected based on the priority
order of the languages.

Since a compiler can produce JavaScript before a working-set
executes and is not necessary during the execution of a
package, compilers are not incorporated into the linkage of
a package.  This means that compiler packages are not
included in package bundles or package bundle dependencies,
so they don't need to be loaded by a browser.

In the future, `interpreter` may be provided as an
alternative to `compiler`, in which case a package will be
bundled with the source code for the module as a resource
and the interpreter package will be included in the
working-set as a dependency, so it can be executed either on
the client or the server.


### Configuration

Presently, the `package.json` of a Lode package must
explicitly note that it is a Lode package.

    {
        "lode": true
    }

If a package is intended to be used by other
package-management systems; like NPM, Teleport, and Jetpack;
Lode supports the CommonJS/Packages `overlays` property,
where package-system-specific properties can be provided.

    {
        "overlays": {
            "lode": {
            },
            "teleport": {
            }
        }
    }

If a package provides an overlay for Lode, the package does
not need a root-level `lode` property; Lode infers it.

`/!\` NPM 0.3 dropped support for the `overlays` property,
which means that, if a package is intended to be used with
NPM, it must provide its configuration at the root and all
other package management systems must use the `overlays`
property to override NPM-specific properties. This also
means that, should any other package managers drop support
for `overlays`, they will be mutually incompatible.


#### Configuring Composition

By default, all modules in a package are publically linked.
The set of public module identifiers can be restricted by
providing a `"public"` array of top-level module identifiers
in the package configuration.

    {
        "public": ["foo", "bar", "baz"]
    }


#### Compatibility Switches

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

For example:

    define(function (require) {
        return {"a": 10, "b": 20};
    });

Or, the literal declaration notation:

    define({
        "a": 10,
        "b": 20
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

- A version control repository URL might be provided so it
  can be downloaded for editing.  If a "path" is also
  provided, `lode` will have the option of placing the
  package at that path so it may be edited in place.
  Without the "path", `lode` would have the option of
  downloading it and running it in memory.
- Alternately, levels of indirection between the dependency
  and the archival download URL might be introduced using a
  catalog or registry URL, a package name, and a version,
  version range, version predicate, or semantic version.

It will be possible to use `lode` to build a stand-alone
executable for a package.

It will be possible for packages to be hosted or bundled for
use in web browsers, for either development or deployment.
It will be possible to use alternate roots for deployment
which may in turn contain alternate configuration.  It is my
hope to leverage Gozala's [Teleport][] package for this
purpose, and to use Q-JSGI and Q-HTTP as at least an option
for the server.  I also hope to leverage of Joe Walker's
[Dry Ice][], through which I've discovered [UglifyJS][]'s
JavaScript API which I would also like to take advantage of.

[Teleport]: https://github.com/Gozala/teleport

[Dry Ice]: https://github.com/mozilla/dryice

[UglifyJS]: https://github.com/mishoo/UglifyJS

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
Narwhal are some of those experiments.  They all are
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
mappings approach as a safer coupling system, limits the
cost of searching for included packages by scoping them to
individual packages, and limits the risk of module
name-space conflation by only linking explicitly included
packages instead of all installed packages.

NPM favors an approach to package management more similar in
spirit to "mappings" and Narwhal favors one more conducive
to "includes".  Kris Zyp's Nodules is written exactly to the
CommonJS Mappings specification. Lode provides both since
they both have their limitations.


License
-------

Copyright 2009, 2010 Kristopher Michael Kowal
MIT License (enclosed)

