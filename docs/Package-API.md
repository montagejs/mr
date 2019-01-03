package.json (package description)
==================================

Mr configures each package based on the contents of `package.json`, the
package description, and the shared configuration. These properties are
meaningful to Mr:

-   **name**: the name of the package, which may be used to connect
    common dependencies of the same name in subpackages.
-   **dependencies**: an object mapping a string that represents both a
    module identifier prefix and a package name, to an ignored version
    predicate.
-   **directories**: an object containing optional `lib` and `packages`
    directory overrides.  The `lib` directory is a location relative to
    this package at which to find modules.  The `packages` directory is
    a location relative to this package in which to find unknown
    packages by name.
-   **main**: the module identifier of the module that represents this
    package when required in other packages by the mapping module
    identier, or in this package by its own name.
