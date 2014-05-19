/*
 * Based in part on Motorola Mobility’s Montage
 * Copyright (c) 2012, Motorola Mobility LLC. All Rights Reserved.
 * 3-Clause BSD License
 * https://github.com/motorola-mobility/montage/blob/master/LICENSE.md
 */
/*global -URL */
/*jshint node:true */

var Require = exports;
var Q = require("q");
var URL = require("url");

if (!this) {
    throw new Error("Require does not work in strict mode.");
}

var globalEval = eval; // reassigning causes eval to not use lexical scope.

// Non-CommonJS speced extensions should be marked with an "// EXTENSION"
// comment.

Require.makeRequire = function (config) {
    var require;

    // Configuration defaults:
    config = config || {};
    config.location = URL.resolve(config.location || Require.getLocation(), "./");
    config.paths = config.paths || [config.location];
    config.mappings = config.mappings || {}; // EXTENSION
    config.exposedConfigs = config.exposedConfigs || Require.exposedConfigs;
    config.makeLoader = config.makeLoader || Require.makeLoader;
    config.load = config.load || config.makeLoader(config);
    config.makeCompiler = config.makeCompiler || Require.makeCompiler;
    config.compile = config.compile || config.makeCompiler(config);
    config.parseDependencies = config.parseDependencies || Require.parseDependencies;
    config.read = config.read || Require.read;
    config.optimizers = config.optimizers || {};
    config.compilers = config.compilers || {};
    config.translators = config.translators || {};
    config.redirectTable = config.redirectTable || [];

    // Modules: { exports, id, location, directory, factory, dependencies,
    // dependees, text, type }
    var modules = config.modules = config.modules || {};

    // produces an entry in the module state table, which gets built
    // up through loading and execution, ultimately serving as the
    // ``module`` free variable inside the corresponding module.
    function getModuleDescriptor(id) {
        var lookupId = id.toLowerCase();
        if (!has(modules, lookupId)) {
            var extension = Require.extension(id);
            var type;
            if (
                extension && (
                    has(config.optimizers, extension) ||
                    has(config.translators, extension) ||
                    has(config.compilers, extension)
                )
            ) {
                type = extension;
            } else {
                type = "js";
            }
            modules[lookupId] = {
                id: id,
                extension: extension,
                type: type,
                display: (config.name || config.location) + "#" + id,
                require: makeRequire(id)
            };
        }
        return modules[lookupId];
    }

    // for preloading modules by their id and exports, useful to
    // prevent wasteful multiple instantiation if a module was loaded
    // in the bootstrapping process and can be trivially injected into
    // the system.
    function inject(id, exports) {
        var module = getModuleDescriptor(id);
        module.exports = exports;
        module.location = URL.resolve(config.location, id);
        module.directory = URL.resolve(module.location, "./");
        module.injected = true;
        module.type = void 0;
        delete module.redirect;
        delete module.mappingRedirect;
    }

    // Ensures a module definition is loaded, compiled, analyzed
    var load = memoize(function (topId, viaId, loading) {
        var module = getModuleDescriptor(topId);
        return Q.try(function () {
            // If not already loaded, already instantiated, or configured as a
            // redirection to another module.
            if (
                module.factory === void 0 &&
                module.exports === void 0 &&
                module.redirect === void 0
            ) {
                return Q(config.load).call(void 0, topId, module);
            }
        })
        .then(function () {
            // Translate (to JavaScript, optionally provide dependency analysis
            // services).
            if (module.type !== "js" && has(config.translators, module.type)) {
                var translatorId = config.translators[module.type];
                return Q.try(function () {
                    // The use of a preprocessor package is optional for
                    // translators, though mandatory for optimizers because
                    // there are .js to .js optimizers, but no such
                    // translators.
                    if (config.hasPreprocessorPackage) {
                        return config.loadPreprocessorPackage();
                    } else {
                        return require;
                    }
                })
                .invoke("async", translatorId)
                .then(function (translate) {
                    module.text = translate(module.text, module);
                    module.type = "js";
                });
            }
        })
        .then(function () {
            if (module.type === "js" && module.text !== void 0 && module.dependencies === void 0) {
                // Remove the shebang
                module.text = module.text.replace(/^#!/, "//#!");
                // Parse dependencies.
                module.dependencies = config.parseDependencies(module.text);
            }

            // Run optional optimizers.
            // {text, type} to {text', type')
            if (config.hasPreprocessorPackage && has(config.optimizers, module.type)) {
                var optimizerId = config.optimizers[module.type];
                return config.loadPreprocessorPackage()
                .invoke("async", optimizerId)
                .then(function (optimize) {
                    optimize(module);
                });
            }
        })
        .then(function () {
            if (
                module.factory === void 0 &&
                module.redirect === void 0 &&
                module.exports === void 0
            ) {
                // Then apply configured compilers.  module {text, type} to
                // {dependencies, factory || exports || redirect}
                if (has(config.compilers, module.type)) {
                    var compilerId = config.compilers[module.type];
                    return deepLoad(compilerId, "", loading)
                    .then(function () {
                        var compile = require(compilerId);
                        compile(module);
                    });
                } else if (module.type === "js") {
                    config.compile(module);
                }
            }

            // Final dependency massaging
            var dependencies = module.dependencies = module.dependencies || [];
            if (module.redirect !== void 0) {
                dependencies.push(module.redirect);
            }
            if (module.extraDependencies !== void 0) {
                Array.prototype.push.apply(module.dependencies, module.extraDependencies);
            }
        });

    });

    // Load a module definition, and the definitions of its transitive
    // dependencies
    function deepLoad(topId, viaId, loading) {
        var module = getModuleDescriptor(topId);
        // this is a memo of modules already being loaded so we don’t
        // data-lock on a cycle of dependencies.
        loading = loading || {};
        // has this all happened before?  will it happen again?
        if (has(loading, topId)) {
            return; // break the cycle of violence.
        }
        loading[topId] = true; // this has happened before
        return load(topId, viaId)
        .then(function () {
            // load the transitive dependencies using the magic of
            // recursion.
            var dependencies = module.dependencies = module.dependencies || [];
            return Q.all(module.dependencies.map(function (depId) {
                depId = resolve(depId, topId);
                // create dependees set, purely for debug purposes
                var module = getModuleDescriptor(depId);
                var dependees = module.dependees = module.dependees || {};
                dependees[topId] = true;
                return deepLoad(depId, topId, loading);
            }));
        }, function (error) {
            module.error = error;
        });
    }

    function lookup(topId, viaId) {
        topId = resolve(topId, viaId);
        var module = getModuleDescriptor(topId);

        // check for consistent case convention
        if (module.id !== topId) {
            throw new Error(
                "Can't require module " + JSON.stringify(module.id) +
                " by alternate spelling " + JSON.stringify(topId)
            );
        }

        // handle redirects
        if (module.redirect !== void 0) {
            return lookup(module.redirect, topId);
        }

        // handle cross-package linkage
        if (module.mappingRedirect !== void 0) {
            return module.mappingRequire.lookup(module.mappingRedirect, "");
        }

        return module;
    }

    // Initializes a module by executing the factory function with a new
    // module "exports" object.
    function getExports(topId, viaId) {
        var module = getModuleDescriptor(topId);

        // check for consistent case convention
        if (module.id !== topId) {
            throw new Error(
                "Can't require module " + JSON.stringify(module.id) +
                " by alternate spelling " + JSON.stringify(topId)
            );
        }

        // check for load error
        if (module.error) {
            var error = module.error;
            error.message = (
                "Can't require module " + JSON.stringify(module.id) +
                " via " + JSON.stringify(viaId) +
                " in " + JSON.stringify(config.name || config.location) +
                " because " + error.message
            );
            throw error;
        }

        // handle redirects
        if (module.redirect !== void 0) {
            return getExports(module.redirect, viaId);
        }

        // handle cross-package linkage
        if (module.mappingRedirect !== void 0) {
            return module.mappingRequire(module.mappingRedirect, viaId);
        }

        // do not reinitialize modules
        if (module.exports !== void 0) {
            return module.exports;
        }

        // do not initialize modules that do not define a factory function
        if (module.factory === void 0) {
            throw new Error(
                "Can't require module " + JSON.stringify(topId) +
                " via " + JSON.stringify(viaId) + " " + JSON.stringify(module)
            );
        }

        module.directory = URL.resolve(module.location, "./"); // EXTENSION
        module.exports = {};

        // Execute the factory function:
        var returnValue = module.factory.call(
            // in the context of the module:
            void 0, // this (defaults to global)
            module.require, // require
            module.exports, // exports
            module, // module
            module.location, // __filename
            module.directory // __dirname
        );

        // EXTENSION
        if (returnValue !== void 0) {
            module.exports = returnValue;
        }

        return module.exports;
    }

    // Finds the internal identifier for a module in a subpackage
    // The `seen` object is a memo of the packages we have seen to avoid
    // infinite recursion of cyclic package dependencies. It also causes
    // the function to return null instead of throwing an exception. I’m
    // guessing that throwing exceptions *and* being recursive would be
    // too much performance evil for one function.
    function identify(id2, require2, seen) {
        var location = config.location;
        if (require2.location === location) {
            return id2;
        }

        var internal = !!seen;
        seen = seen || {};
        if (has(seen, location)) {
            return null; // break the cycle of violence.
        }
        seen[location] = true;
        /*jshint -W089 */
        for (var name in config.mappings) {
            var mapping = config.mappings[name];
            location = mapping.location;
            if (!config.hasPackage(location)) {
                continue;
            }
            var candidate = config.getPackage(location);
            var id1 = candidate.identify(id2, require2, seen);
            if (id1 === null) {
                continue;
            } else if (id1 === "") {
                return name;
            } else {
                return name + "/" + id1;
            }
        }
        if (internal) {
            return null;
        } else {
            throw new Error(
                "Can't identify " + id2 + " from " + require2.location
            );
        }
        /*jshint +W089 */
    }

    // Creates a unique require function for each module that encapsulates
    // that module's id for resolving relative module IDs against.
    function makeRequire(viaId) {

        // Main synchronously executing "require()" function
        var require = function(id) {
            var topId = resolve(id, viaId);
            return getExports(topId, viaId);
        };

        // Asynchronous "require.async()" which ensures async executation
        // (even with synchronous loaders)
        require.async = function(id) {
            var topId = resolve(id, viaId);
            var module = getModuleDescriptor(id);
            return deepLoad(topId, viaId)
            .then(function () {
                return require(topId);
            });
        };

        require.resolve = function (id) {
            return normalize(resolve(id, viaId));
        };

        require.getModule = getModuleDescriptor; // XXX deprecated, use:
        require.getModuleDescriptor = getModuleDescriptor;
        require.lookup = lookup;
        require.load = load;
        require.deepLoad = deepLoad;

        require.loadPackage = function (dependency, givenConfig) {
            if (givenConfig) { // explicit configuration, fresh environment
                return Require.loadPackage(dependency, givenConfig);
            } else { // inherited environment
                return config.loadPackage(dependency, config);
            }
        };

        require.hasPackage = function (dependency) {
            return config.hasPackage(dependency);
        };

        require.getPackage = function (dependency) {
            return config.getPackage(dependency);
        };

        require.isMainPackage = function () {
            return require.location === config.mainPackageLocation;
        };

        require.injectPackageDescription = function (location, description) {
            Require.injectPackageDescription(location, description, config);
        };

        require.injectPackageDescriptionLocation = function (location, descriptionLocation) {
            Require.injectPackageDescriptionLocation(location, descriptionLocation, config);
        };

        require.injectMapping = function (dependency, name) {
            dependency = normalizeDependency(dependency, config, name);
            name = name || dependency.name;
            config.mappings[name] = dependency;
        };

        require.injectDependency = function (name) {
            require.injectMapping({name: name}, name);
        };

        require.identify = identify;
        require.inject = inject;

        config.exposedConfigs.forEach(function(name) {
            require[name] = config[name];
        });

        require.config = config;

        require.read = config.read;

        return require;
    }

    require = makeRequire("");
    return require;
};

Require.injectPackageDescription = function (location, description, config) {
    var descriptions =
        config.descriptions =
            config.descriptions || {};
    descriptions[location] = Q.resolve(description);
};

Require.injectPackageDescriptionLocation = function (location, descriptionLocation, config) {
    var descriptionLocations =
        config.descriptionLocations =
            config.descriptionLocations || {};
    descriptionLocations[location] = descriptionLocation;
};

Require.loadPackageDescription = function (dependency, config) {
    var location = dependency.location;
    var descriptions =
        config.descriptions =
            config.descriptions || {};
    if (descriptions[location] === void 0) {
        var descriptionLocations =
            config.descriptionLocations =
                config.descriptionLocations || {};
        var descriptionLocation;
        if (descriptionLocations[location]) {
            descriptionLocation = descriptionLocations[location];
        } else {
            descriptionLocation = URL.resolve(location, "package.json");
        }
        descriptions[location] = (config.read || Require.read)(descriptionLocation)
        .then(function (json) {
            try {
                return JSON.parse(json);
            } catch (error) {
                error.message = error.message + " in " + JSON.stringify(descriptionLocation);
                throw error;
            }
        });
    }
    return descriptions[location];
};

Require.loadPackage = function (dependency, config) {
    dependency = normalizeDependency(dependency, config);
    if (!dependency.location) {
        throw new Error("Can't find dependency: " + JSON.stringify(dependency));
    }
    var location = dependency.location;
    config = Object.create(config || null);
    var loadingPackages = config.loadingPackages = config.loadingPackages || {};
    var loadedPackages = config.packages = {};
    var registry = config.registry = config.registry || Object.create(null);
    config.mainPackageLocation = location;

    config.hasPackage = function (dependency) {
        dependency = normalizeDependency(dependency, config);
        if (!dependency.location) {
            return false;
        }
        var location = dependency.location;
        return !!loadedPackages[location];
    };

    config.getPackage = function (dependency) {
        dependency = normalizeDependency(dependency, config);
        if (!dependency.location) {
            throw new Error("Can't find dependency: " + JSON.stringify(dependency) + " from " + config.location);
        }
        var location = dependency.location;
        if (!loadedPackages[location]) {
            if (loadingPackages[location]) {
                throw new Error(
                    "Dependency has not finished loading: " + JSON.stringify(dependency)
                );
            } else {
                throw new Error(
                    "Dependency was not loaded: " + JSON.stringify(dependency)
                );
            }
        }
        return loadedPackages[location];
    };

    config.loadPackage = function (dependency, viaConfig, loading) {
        dependency = normalizeDependency(dependency, viaConfig);
        if (!dependency.location) {
            throw new Error("Can't find dependency: " + JSON.stringify(dependency) + " from " + config.location);
        }
        var location = dependency.location;

        // prevent data-lock if there is a package dependency cycle
        loading = loading || {};
        if (loading[location]) {
            // returns an already-fulfilled promise for `undefined`
            return Q();
        }
        loading[location] = true;

        if (!loadingPackages[location]) {

            loadingPackages[location] = Require.loadPackageDescription(dependency, config)
            .then(function (packageDescription) {
                var subconfig = configurePackage(
                    location,
                    packageDescription,
                    config
                );

                subconfig.loadPreprocessorPackage = function () {
                    if (!viaConfig) {
                        return Q(config.preprocessorPackage);
                    } else {
                        return viaConfig.loadPreprocessorPackage()
                        .invoke("loadPackage", dependency);
                    }
                };

                var pkg = Require.makeRequire(subconfig);
                loadedPackages[location] = pkg;
                return Q.all(Object.keys(subconfig.mappings).map(function (prefix) {
                    var dependency = subconfig.mappings[prefix];
                    return config.loadPackage(dependency, subconfig, loading);
                }))
                .then(function () {
                    postConfigurePackage(subconfig, packageDescription);
                })
                .thenResolve(pkg);
            });
            loadingPackages[location].done();
        }
        return loadingPackages[location];
    };

    var pkg = config.loadPackage(dependency);
    pkg.location = location;
    pkg.async = function (id, callback) {
        return pkg.then(function (require) {
            return require.async(id, callback);
        });
    };

    config.hasPreprocessorPackage = !!config.preprocessorPackage;

    return pkg;
};

function normalizeDependency(dependency, config, name) {
    config = config || {};
    if (typeof dependency === "string") {
        dependency = {
            location: dependency
        };
    }
    if (dependency.main) {
        dependency.location = config.mainPackageLocation;
    }
    // if the named dependency has already been found at another
    // location, refer to the same eventual instance
    if (
        dependency.name &&
        config.registry &&
        config.registry[dependency.name]
    ) {
        dependency.location = config.registry[dependency.name];
    }
    // default location
    if (!dependency.location && config.packagesDirectory && dependency.name) {
        dependency.location = URL.resolve(
            config.packagesDirectory,
            dependency.name + "/"
        );
    }
    if (!dependency.location) {
        return dependency; // partially completed
    }
    // make sure the dependency location has a trailing slash so that
    // relative urls will resolve properly
    if (!/\/$/.test(dependency.location)) {
        dependency.location += "/";
    }
    // resolve the location relative to the current package
    if (!Require.isAbsolute(dependency.location)) {
        if (!config.location) {
            throw new Error(
                "Dependency locations must be fully qualified: " +
                JSON.stringify(dependency)
            );
        }
        dependency.location = URL.resolve(
            config.location,
            dependency.location
        );
    }
    // register the package name so the location can be reused
    if (dependency.name) {
        config.registry[dependency.name] = dependency.location;
    }
    return dependency;
}

function configurePackage(location, description, parent) {

    if (!/\/$/.test(location)) {
        location += "/";
    }

    var config = Object.create(parent);
    config.parent = parent;
    config.name = description.name;
    config.location = location || Require.getLocation();
    config.packageDescription = description;
    config.useScriptInjection = description.useScriptInjection;

    if (description.production !== void 0) {
        config.production = description.production;
    }

    // explicitly mask definitions and modules, which must
    // not apply to child packages
    var modules = config.modules = config.modules || {};

    var registry = config.registry;
    if (config.name !== void 0 && !registry[config.name]) {
        registry[config.name] = config.location;
    }

    // overlay
    var overlay = description.overlay || {};

    // but first, convert "browser" field, as pioneered by Browserify, to an
    // overlay
    if (typeof description.browser === "string") {
        overlay.browser = {
            redirects: {"": description.browser}
        };
    } else if (typeof description.browser === "object") {
        overlay.browser = {
            redirects: description.browser
        };
    }

    // overlay continued...
    var layer;
    (config.overlays || Require.overlays).forEach(function (engine) {
        /*jshint -W089 */
        if (overlay[engine]) {
            var layer = overlay[engine];
            merge(description, layer);
        }
        /*jshint +W089 */
    });
    delete description.overlay;

    config.packagesDirectory = URL.resolve(location, "node_modules/");

    // The default "main" module of a package has the same name as the
    // package.
    if (description.main !== void 0) {

        // main, injects a definition for the main module, with
        // only its path. makeRequire goes through special effort
        // in deepLoad to re-initialize this definition with the
        // loaded definition from the given path.
        modules[""] = {
            id: "",
            redirect: normalize(resolve(description.main, "")),
            location: config.location
        };

    }

    // Deal with redirects
    var redirects = description.redirects;
    if (redirects !== void 0) {
        Object.keys(redirects).forEach(function (name) {
            modules[name] = {
                id: name,
                redirect: normalize(resolve(redirects[name], "")),
                location: URL.resolve(location, name)
            };
        });
    }

    // mappings, link this package to other packages.
    var mappings = description.mappings || {};
    // dependencies, devDependencies if not in production, if not installed by NPM
    [
        description.dependencies,
        description._id || description.production ?
            null :
            description.devDependencies
    ]
    .forEach(function (dependencies) {
        if (!dependencies) {
            return;
        }
        Object.keys(dependencies).forEach(function (name) {
            if (!mappings[name]) {
                // dependencies are equivalent to name and version mappings,
                // though the version predicate string is presently ignored
                // (TODO)
                mappings[name] = {
                    name: name,
                    version: dependencies[name]
                };
            }
        });
    });
    // mappings
    Object.keys(mappings).forEach(function (name) {
        mappings[name] = normalizeDependency(
            mappings[name],
            config,
            name
        );
    });
    config.mappings = mappings;

    // per-extension configuration
    config.optimizers = description.optimizers;
    config.compilers = description.compilers;
    config.translators = description.translators;

    return config;
}

function postConfigurePackage(config, description) {
    var mappings = config.mappings;
    var prefixes = Object.keys(mappings);
    var redirectTable = config.redirectTable = config.redirectTable || [];
    prefixes.forEach(function (prefix) {

        var dependency = mappings[prefix];
        if (!config.hasPackage(dependency)) {
            return;
        }
        var package = config.getPackage(dependency);
        var extensions;

        // reference optimizers
        var myOptimizers = config.optimizers = config.optimizers || {};
        var theirOptimizers = package.config.optimizers;
        extensions = Object.keys(theirOptimizers);
        extensions.forEach(function (extension) {
            myOptimizers[extension] = prefix + "/" + theirOptimizers[extension];
        });

        // reference translators
        var myTranslators = config.translators = config.translators || {};
        var theirTranslators = package.config.translators;
        extensions = Object.keys(theirTranslators);
        extensions.forEach(function (extension) {
            myTranslators[extension] = prefix + "/" + theirTranslators[extension];
        });

        // reference compilers
        var myCompilers = config.compilers = config.compilers || {};
        var theirCompilers = package.config.compilers;
        extensions = Object.keys(theirCompilers);
        extensions.forEach(function (extension) {
            myCompilers[extension] = prefix + "/" + theirCompilers[extension];
        });

        // copy redirect patterns
        redirectTable.push.apply(
            redirectTable,
            package.config.redirectTable
        );

    });

    if (description["redirect-patterns"]) {
        var describedPatterns = description["redirect-patterns"];
        for (var pattern in describedPatterns) {
            if (has(describedPatterns, pattern)) {
                redirectTable.push([
                    new RegExp(pattern),
                    describedPatterns[pattern]
                ]);
            }
        }
    }
}

function merge(target, source) {
    for (var name in source) {
        if (has(source, name)) {
            var sourceValue = source[name];
            var targetValue = target[name];
            if (sourceValue === null) {
                delete target[name];
            } else if (
                typeof sourceValue === "object" && !Array.isArray(sourceValue) &&
                typeof targetValue === "object" && !Array.isArray(targetValue)
            ) {
                merge(targetValue, sourceValue);
            } else {
                target[name] = source[name];
            }
        }
    }
}

Require.exposedConfigs = [
    "location",
    "packageDescription",
    "packages",
    "modules"
];

// Built-in compiler/preprocessor "middleware":

Require.makeCompiler = function(config) {
    return Require.JsonCompiler(
        config,
        Require.LintCompiler(
            config,
            Require.Compiler(config)
        )
    );
};

Require.JsonCompiler = function (config, compile) {
    return function (module) {
        var json = (module.location || "").match(/\.json$/);
        if (json) {
            module.exports = JSON.parse(module.text);
            return module;
        } else {
            return compile(module);
        }
    };
};

Require.LintCompiler = function(config, compile) {
    return function(module) {
        try {
            compile(module);
        } catch (error) {
            if (config.lint) {
                // TODO: use ASAP
                Q.nextTick(function () {
                    config.lint(module);
                });
            }
            throw error;
        }
    };
};

// Built-in loader "middleware":

Require.CommonLoader = function (config, load) {
    return Require.MappingsLoader(
        config,
        Require.RedirectPatternsLoader(
            config,
            Require.LocationLoader(
                config,
                Require.MemoizedLoader(
                    config,
                    load
                )
            )
        )
    );
};

// Using mappings hash to load modules that match a mapping.
Require.MappingsLoader = function(config, load) {
    config.mappings = config.mappings || {};
    config.name = config.name;

    // finds a mapping to follow, if any
    return function (id, module) {
        var mappings = config.mappings;
        var prefixes = Object.keys(mappings);
        var length = prefixes.length;

        if (Require.isAbsolute(id)) {
            return load(id, module);
        }
        var i, prefix;
        for (i = 0; i < length; i++) {
            prefix = prefixes[i];
            if (
                id === prefix ||
                id.indexOf(prefix) === 0 &&
                id.charAt(prefix.length) === "/"
            ) {
                /*jshint -W083 */
                var mapping = mappings[prefix];
                var rest = id.slice(prefix.length + 1);
                return config.loadPackage(mapping, config)
                .then(function (mappingRequire) {
                    /*jshint +W083 */
                    module.mappingRedirect = rest;
                    module.mappingRequire = mappingRequire;
                    return mappingRequire.deepLoad(rest, config.location);
                });
            }
        }
        return load(id, module);
    };
};

Require.RedirectPatternsLoader = function (config, load) {
    return function (id, module) {
        var table = config.redirectTable || [];
        for (var i = 0; i < table.length; i++) {
            var expression = table[i][0];
            var match = expression.exec(id);
            if (match) {
                var replacement = table[i][1];
                module.redirect = id.replace(expression, replacement);
                return;
            }
        }
        return load(id, module);
    };
};

Require.LocationLoader = function (config, load) {
    return function (id, module) {
        var base = id;
        var extension = module.extension;
        if (
            !has(config.optimizers, extension) &&
            !has(config.translators, extension) &&
            !has(config.compilers, extension) &&
            extension !== "js" &&
            extension !== "json"
        ) {
            base += ".js";
        }
        var location = URL.resolve(config.location, base);
        return load(location, module);
    };
};

Require.MemoizedLoader = function (config, load) {
    var cache = config.cache = config.cache || {};
    return memoize(load, cache);
};

// Helper functions:

// Resolves CommonJS module IDs (not paths)
Require.resolve = resolve;
function resolve(id, baseId) {
    id = String(id);
    var source = id.split("/");
    var target = [];
    if (source.length && source[0] === "." || source[0] === "..") {
        var parts = baseId.split("/");
        parts.pop();
        source.unshift.apply(source, parts);
    }
    for (var i = 0, ii = source.length; i < ii; i++) {
        /*jshint -W035 */
        var part = source[i];
        if (part === "" || part === ".") {
        } else if (part === "..") {
            if (target.length) {
                target.pop();
            }
        } else {
            target.push(part);
        }
        /*jshint +W035 */
    }
    return target.join("/");
}

Require.normalize = normalize;
function normalize(id) {
    var match = /^(.*)\.js$/.exec(id);
    if (match) {
        id = match[1];
    }
    return id;
}

Require.extension = extension;
function extension(location) {
    var match = /\.([^\/\.]+)$/.exec(location);
    if (match) {
        return match[1];
    }
}

// Tests whether the location or URL is a absolute.
Require.isAbsolute = isAbsolute;
function isAbsolute(location) {
    return (/^[\w\-]+:/).test(location);
}

// Extracts dependencies by parsing code and looking for "require" (currently
// using a simple regexp)
Require.parseDependencies = parseDependencies;
function parseDependencies(text) {
    var o = {};
    String(text).replace(/(?:^|[^\w\$_.])require\s*\(\s*["']([^"']*)["']\s*\)/g, function(_, id) {
        o[id] = true;
    });
    return Object.keys(o);
}

function has(object, property) {
    return Object.prototype.hasOwnProperty.call(object, property);
}

function memoize(callback, cache) {
    cache = cache || {};
    return function (key, arg) {
        if (!has(cache, key)) {
            cache[key] = Q(callback).call(void 0, key, arg);
        }
        return cache[key];
    };
}

