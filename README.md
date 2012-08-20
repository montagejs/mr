
Montage Require
===============

This is a CommonJS module system, highly compatible with NodeJS,
intended for front-end development of web applications using NPM style
packages.  It is designed to be automatically replaced by the Montage
Optimizer with a smaller, faster, and bundled production module system.

To use, install the module system in your application package with NPM.

```
npm install mr
```

Then, incorporate the Montage Require bootstrapping script in an HTML
document.

```html
<script
    src="node_modules/mr/bootstrap.js"
    data-module="index"
></script>
```

```html
<script
    src="node_modules/mr/bootstrap.js"
    data-auto-package
    data-module="index"
></script>
```

```html
<script
    src="node_modules/mr/bootstrap.js"
    data-package="."
    data-module="index"
></script>
```

-   `data-auto-package` indicates that there is no `package.json` for
    this application, and instructs Montage Require to pretend that an
    empty one exists in the same directory as the HTML document.
-   `data-package` alternately, indicates that there is a `package.json`
    and that it can be found at the given location.  The default
    location is the same directory as the HTML file.
-   `data-module` instructs Montage Require to `require` the given
    module after it has finished bootstrapping and the DOM content
    has loaded.


Node and NPM Compatibility
==========================

Montage fully supports CommonJS Modules and Packages.  It also supports
some of the extensions from NodeJS and NPM.

-   **module.exports**: Modules that do not have cyclic dependencies
    (modules with dependencies that in turn ultimately depend their own
    exports) can redefine their exports object by assigning to
    ``module.exports``.
-   **dependencies**: If a package declares a package dependency using
    NPM’s ``dependencies`` property, Montage looks for that package in
    the package’s ``node_modules`` subdirectory.  Montage Require also
    supports the case where a package with the same name is already
    loaded by a parent package.  Unlike NPM, with Montage packages, you
    can override the location of the ``node_modules`` directory with the
    ``directories.packages`` property, or use mappings to find
    individual packages in alternate locations or give them different
    local names.

Extensions:

-   **redirects**: a `redirects` block in `package.json` a module
    identifier to redirect to an alternate module identifier.
-   **returnable exports**:  A module can return an exports object.  This
    would make that module incompatible with NodeJS, where the idiom
    `module.exports =` prevails.
-   **mappings**: Packages can declare some or all of their package
    dependencies with the URL ``location`` of the package, particularly
    a URL relative to the depending package.  Mappings override
    dependencies if there are conflicts.
-   **require.packageDescription**: Packages expose the parsed
    contents of the ``package.json`` file.
-   **module.location**: Packages expose the URL of the corresponding
    source.
-   **module.directory**: Packages expose the URL of the directory
    containing the corresponding source.

Not supported:

-   `dependencies` version predicates are ignored.
-   `__filename` and `__dirname` are not injected into module scope.
    Consider using `module.location` and `module.directory` URLs
    instead.
-   `index.js` is not sought if you require a directory.  To make a
    package using an `index.js` compatible with Montage Require, add a
    `redirects` block to `package.json` like `{"redirects": {"foo":
    "foo/index"}}`.

The Montage modules debug-mode run-time loads modules asynchronously and
calculates their transitive dependencies heuristically--by statically
scanning for ``require`` calls using a simple regular expression.
Montage can load cross-origin scripts in debug-mode if the CORS headers
are set on the remote server.

Take a look at the Montage Optimizer to optimize applications for
production.  The optimizer can bundle packages with all of the dependent
modules, can preload bundles of progressive enhancements in phases, and
can generate HTML5 application cache manifests.


Cross-browser Compatibility
===========================

At present, Montage Require depends on `document.querySelector` and
probably several other recent EcmaScript methods that might not be
available in legacy browsers.  With your help, I intend to isolate and
fix these bugs.

At time of writing, tests pass in Chrome 21, Safari 5.1.5, and Firefox
13 on Mac OS 10.6.


Optimizer Options
=================

The Montage Optimizer, `mop`, does not yet handle stand-alone Montage
Require.  However, when it does, the optimizer can convert entire
packages to production ready versions without manual alteration.  The
optimizer rewrites HTML, particularly replacing the bootstrapping script
with a bundle.  As such, the run-time supports some additional options.

-   `data-bootstrap` indicates that this script element is the
    `bootstrap.js` script and denotes the location of that script.
    This is normally inferred from being a script with a `bootstrap.js`
    file name, but an optimizer might replace the `<script>` tag with a
    bundle with a different name.

The optimizer can convert all resources into script-injection form, by
changing `.js` modules to `.load.js` scripts with `define(hash, id,
descriptor)` boilerplate.  This permits packages to be loaded
cross-origin and with content security policies that forbid `eval`.  The
hash is a consistent hash for each package.  The bootstrapper needs to
know these hashes so it can recognize incoming `package.json.load.js`
definitions.

-   `data-bootstrap-hash`
-   `data-application-hash`
-   `data-q-hash`

Among other things, the optimizer is also responsible for processing
`package.json` files to include the `hash` of each `dependency`.


Maintenance
===========

Tests are in the `spec` directory.  All of the CommonJS module tests
exist in there as well as tests for packaging and extensions.

Open `spec/run.html` in a browser to verify the specs.

This implementation is a part from Motorola Mobility’s [Montage][] web
application framework.  The module system was  written by Tom Robinson
and Kris Kowal.  Motorola holds the copyright on much of the original
content, and provided it as open source under the permissive BSD
3-Clause license.  This project is maintained by Kris Kowal, continuing
with that license.

[Montage]: http://github.com/montage.js/montage

