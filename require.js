
/*
    Based in part on Motorola Mobility’s Montage
    Copyright (c) 2012, Motorola Mobility LLC. All Rights Reserved.
    3-Clause BSD License
    https://github.com/motorola-mobility/montage/blob/master/LICENSE.md
*/

/*global bootstrap,define */
(function (definition) {

    // Boostrapping Browser
    if (typeof bootstrap !== "undefined") {

        // Window
        if (typeof window !== "undefined") {
            bootstrap("require", function (require, exports) {
                var Promise = require("promise");
                var URL = require("mini-url");
                definition(exports, Promise, URL);
                require("require/browser");
            });

        // Worker
        } else {
            bootstrap("require", function (require, exports) {
                var Promise = require("promise").Promise;
                var URL = require("mini-url");
                definition(exports, Promise, URL);
            });
        }

    // Node Server
    } else if (typeof process !== "undefined") {
        // the parens trick the heuristic scanner for static dependencies, so
        // they are not pre-loaded by the asynchronous browser loader
        var Promise = (require)("q");
        var URL = (require)("url");
        definition(exports, Promise, URL);
        (require)("./node");
    } else {
        throw new Error("Can't support require on this platform");
    }

})(function (Require, Promise, URL) {

    if (!this) {
        throw new Error("Require does not work in strict mode.");
    }

    var globalEval = eval; // reassigning causes eval to not use lexical scope.
    var ArrayPush = Array.prototype.push;

    // Non-CommonJS speced extensions should be marked with an "// EXTENSION"
    // comment.


	var _Module = function _Module() {};
	_Module.prototype.id = null;
	_Module.prototype.display = null;
	_Module.prototype.require = null;
	_Module.prototype.factory = void 0;
	_Module.prototype.exports = void 0;
	_Module.prototype.redirect = void 0;
	_Module.prototype.location = null;
	_Module.prototype.directory = null;
	_Module.prototype.injected = false;
	_Module.prototype.mappingRedirect = void 0;
	_Module.prototype.type = null;
	_Module.prototype.text = void 0;
	_Module.prototype.dependees = null;
	_Module.prototype.extraDependencies = void 0;
	_Module.prototype.uuid = null;

    Require.makeRequire = function (config) {
        var require;

        // Configuration defaults:
        config = config || {};
        config.location = URL.resolve(config.location || Require.getLocation(), "./");
        config.paths = config.paths || [config.location];
        config.mappings = config.mappings || {}; // EXTENSION
        config.exposedConfigs = config.exposedConfigs || Require.exposedConfigs;
        config.moduleTypes = config.moduleTypes || [];
        config.makeLoader = config.makeLoader || Require.makeLoader;
        config.load = config.load || config.makeLoader(config);
        config.makeCompiler = config.makeCompiler || Require.makeCompiler;
        config.compile = config.compile || config.makeCompiler(config);
        config.parseDependencies = config.parseDependencies || Require.parseDependencies;
        config.read = config.read || Require.read;
        config.registry = Object.create(null);
        config.packages = {};

        // Modules: { exports, id, location, directory, factory, dependencies,
        // dependees, text, type }
        var modules = config.modules = config.modules || Object.create(null);

        // produces an entry in the module state table, which gets built
        // up through loading and execution, ultimately serving as the
        // ``module`` free variable inside the corresponding module.
        function getModuleDescriptor(id) {
            var lookupId = id.toLowerCase();
            if (!(lookupId in modules)) {
				//var aModule = Object.create(_Module);
				//var aModule = {};
				var aModule = new _Module;
                modules[lookupId] = aModule;
                    aModule.id = id;
                    aModule.display = (config.name || config.location) + "#" + id; // EXTENSION
                    aModule.require = require;
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
			module.redirect = void 0;
			module.mappingRedirect = void 0;
            // delete module.redirect;
            // delete module.mappingRedirect;

        }

        // Ensures a module definition is loaded, compiled, analyzed
        var load = memoize(function (topId, viaId) {
            var module = getModuleDescriptor(topId);
            return Promise.try(function () {
                // if not already loaded, already instantiated, or
                // configured as a redirection to another module
                if (
                    module.factory === void 0 &&
                    module.exports === void 0 &&
                    module.redirect === void 0
                ) {
                    //return Promise.try(config.load, [topId, module]);
                    return config.load(topId, module);
                }
            })
            .then(function () {
                // compile and analyze dependencies
                config.compile(module);
                var dependencies =
                    module.dependencies =
                        module.dependencies || [];
                if (module.redirect !== void 0) {
                    dependencies.push(module.redirect);
                }
                if (module.extraDependencies !== void 0) {
                    ArrayPush.apply(module.dependencies, module.extraDependencies);
                }
            });
        });

        // Load a module definition, and the definitions of its transitive
        // dependencies
        function deepLoad(topId, viaId, loading) {
            var module = getModuleDescriptor(topId);
            // this is a memo of modules already being loaded so we don’t
            // data-lock on a cycle of dependencies.
            loading = loading || Object.create(null);
            // has this all happened before?  will it happen again?
            if (topId in loading) {
                return; // break the cycle of violence.
            }
            loading[topId] = true; // this has happened before
            return load(topId, viaId)
            .then(function () {
                // load the transitive dependencies using the magic of
                // recursion.
				var dependencies =  module.dependencies
					, promises = []
					, iModule
					, depId
					,dependees;
				for(var i=0, countI = dependencies.length;(depId = dependencies[i]);i++) {
                    depId = resolve(depId, topId);
                    // create dependees set, purely for debug purposes
                    iModule = getModuleDescriptor(depId);
                    dependees = iModule.dependees = iModule.dependees || {};
                    dependees[topId] = true;
                    promises.push(deepLoad(depId, topId, loading));
				}
                return Promise.all(promises);
            }, function (error) {
                module.error = error;
            });
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
                var error = new Error(
                    "Can't require module " + JSON.stringify(module.id) +
                    " via " + JSON.stringify(viaId) +
                    " because " + module.error.message
                );
                error.cause = module.error;
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
                    " via " + JSON.stringify(viaId)
                );
            }

            module.directory = URL.resolve(module.location, "./"); // EXTENSION
            module.exports = {};

            var returnValue;
            try {
                // Execute the factory function:
                returnValue = module.factory(
                    makeRequire(topId), // require
                    module.exports, // exports
                    module // module
                );
            } catch (_error) {
                // Delete the exports so that the factory is run again if this
                // module is required again
                //delete module.exports;
                module.exports = void 0;
                throw _error;
            }

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
            seen = seen || Object.create(null);
            if (location in seen) {
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
                //var module = getModuleDescriptor(id);
                return deepLoad(topId, viaId)
                .then(function () {
                    return require(topId);
                });
            };

			require._resolved = Object.create(null);

            require.resolve = function (id) {
                return this._resolved[id] || (this._resolved[id] = normalizeId(resolve(id, viaId)));
            };

            require.getModule = getModuleDescriptor; // XXX deprecated, use:
            require.getModuleDescriptor = getModuleDescriptor;
            require.load = load;
            require.deepLoad = deepLoad;

            require.loadPackage = function (dependency, givenConfig) {
                if (givenConfig) { // explicit configuration, fresh environment
                    return Require.loadPackage(dependency, givenConfig);
                } else { // inherited environment
                    return this.config.loadPackage(dependency, this.config);
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

			var exposedConfigs = config.exposedConfigs;
			for(var i=0, countI=exposedConfigs.length;i<countI;i++) {
                require[exposedConfigs[i]] = config[exposedConfigs[i]];
			}

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
        descriptions[location] = Promise.resolve(description);
    };

    Require.injectLoadedPackageDescription = function (location, packageDescription, config, require) {
        var subconfig = configurePackage(
            location,
            packageDescription,
            config
        );
        var pkg;
        if(typeof require === "function") {
            pkg = require;
        }
        else {
            if(Require.delegate && Require.delegate.willCreatePackage) {
            	pkg = Require.delegate.willCreatePackage(location, packageDescription, subconfig);
            }
        	if(!pkg) {
                pkg = Require.makeRequire(subconfig);
                if(Require.delegate && Require.delegate.didCreatePackage) {
                	Require.delegate.didCreatePackage(subconfig);
                }

        	}
        }
        config.packages[location] = pkg;
        return pkg;
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

            var promise;

            if(Require.delegate) {
                promise = Require.delegate.requireWillLoadPackageDescriptionAtLocation(descriptionLocation,dependency, config);
            }
            if(!promise) {
                promise = (config.read || Require.read)(descriptionLocation);
            }

            descriptions[location] = promise.then(function (json) {
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

    Require.loadPackage = function (dependency, config, packageDescription) {
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

        config.loadPackage = function (dependency, viaConfig) {
            dependency = normalizeDependency(dependency, viaConfig);
            if (!dependency.location) {
                throw new Error("Can't find dependency: " + JSON.stringify(dependency) + " from " + config.location);
            }
            var location = dependency.location;
            if (!loadingPackages[location]) {
                loadingPackages[location] = Require.loadPackageDescription(dependency, config)
                .then(function (packageDescription) {
                    return Require.injectLoadedPackageDescription(location, packageDescription, config)
                });
            }
            return loadingPackages[location];
        };

        var pkg;
        if(typeof packageDescription === "object") {
            pkg = Require.injectLoadedPackageDescription(location, packageDescription, config)
        }
        else {
            pkg = config.loadPackage(dependency);
        }

        pkg.location = location;
        pkg.async = function (id, callback) {
            return pkg.then(function (require) {
                return require.async(id, callback);
            });
        };

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

        // but first, convert "browser" field, as pioneered by Browserify, to
        // an overlay
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
        var layer, overlays, engine;
        overlays = config.overlays = config.overlays || Require.overlays;
		for(var i=0, countI=overlays.length;i<countI;i++) {
			if (layer = overlay[(engine = overlays[i])]) {
                for (var name in layer) {
                    description[name] = layer[name];
                }
            }
		}
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
                redirect: normalizeId(resolve(description.main, "")),
                location: config.location
            };

        }

        //Deal with redirects
        var redirects = description.redirects;
        if (redirects !== void 0) {
            Object.keys(redirects).forEach(function (name) {
                modules[name] = {
                    id: name,
                    redirect: normalizeId(resolve(redirects[name], name)),
                    location: URL.resolve(location, name)
                };
            });
        }

        // mappings, link this package to other packages.
        var mappings = description.mappings || {};
        // dependencies, devDependencies if not in production
        [description.dependencies, !config.production ? description.devDependencies : null]
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
            var mapping = mappings[name] = normalizeDependency(
                mappings[name],
                config,
                name
            );
        });
        config.mappings = mappings;

        return config;
    }

    // Resolves CommonJS module IDs (not paths)
    Require.resolve = resolve;
	var _resolved = Object.create(null);
	var _resolveStringtoArray = Object.create(null);
	var _target = [];

	function _resolveItem(source, part, target) {
	    /*jshint -W035 */
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

    function resolve(id, baseId) {
		var resolved = _resolved[id] || (_resolved[id] = Object.create(null));
		var i, ii;
		if(!(baseId in resolved)) {
	        id = String(id);
	        var source = _resolveStringtoArray[id] || (_resolveStringtoArray[id] = id.split("/"));
	        var parts = _resolveStringtoArray[baseId] || (_resolveStringtoArray[baseId] = baseId.split("/"));
	        //var target = [];
	        if (source.length && source[0] === "." || source[0] === "..") {
	            for (i = 0, ii = parts.length-1; i < ii; i++) {
    	            _resolveItem(parts, parts[i], _target);
    	        }
	        }
	        for (i = 0, ii = source.length; i < ii; i++) {
	            _resolveItem(source, source[i], _target);
	        }
	        resolved[baseId] = _target.join("/");
	        _target.length = 0;
		}
		return resolved[baseId];
    }

    var extensionPattern = /\.([^\/\.]+)$/;
    Require.extension = function (path) {
        var match = extensionPattern.exec(path);
        if (match) {
            return match[1];
        }
    };

    // Tests whether the location or URL is a absolute.
    var isAbsolutePattern = /^[\w\-]+:/;
    Require.isAbsolute = function isAbsolute(location) {
        return isAbsolutePattern.test(location);
    };

    // Extracts dependencies by parsing code and looking for "require" (currently using a simple regexp)
    var requirePattern = /(?:^|[^\w\$_.])require\s*\(\s*["']([^"']*)["']\s*\)/g;
    // Require.parseDependencies = function parseDependencies(factory) {
    //     var o = {};
    //     String(factory).replace(requirePattern, function(_, id) {
    //         o[id] = true;
    //     });
    //     return Object.keys(o);
    // };

    // Require.parseDependencies = function parseDependencies(factory) {
    //     var o = [];
    //     String(factory).replace(requirePattern, function(_, id) {
    //         if(o.indexOf(id) === -1) {
    //             o.push(id);
    //         }
    //     });
    //     return o;
    // };

    Require.parseDependencies = function parseDependencies(factory) {
        var o = [], myArray;
        while ((myArray = requirePattern.exec(factory)) !== null) {
            o.push(myArray[1]);
        }
        return o;
    };


    // Built-in compiler/preprocessor "middleware":

    Require.DependenciesCompiler = function(config, compile) {
        return function(module) {
            if (!module.dependencies && module.text !== void 0) {
                module.dependencies = config.parseDependencies(module.text);
            }
            compile(module);
            if (module && !module.dependencies) {
                if (module.text || module.factory) {
                    module.dependencies = Require.parseDependencies(module.text || module.factory);
                } else {
                    module.dependencies = [];
                }
            }
			//module.text = null;
            return module;
        };
    };

    // Support she-bang for shell scripts by commenting it out (it is never
    // valid JavaScript syntax anyway)
    var shebangPattern = /^#!/;
    var shebangCommented = "//#!";
    Require.ShebangCompiler = function(config, compile) {
        return function (module) {
            if (module.text) {
                module.text = module.text.replace(shebangPattern, shebangCommented);
            }
            compile(module);
			//module.text = null;
        };
    };

    Require.LintCompiler = function(config, compile) {
        return function(module) {
            try {
                compile(module);
            } catch (error) {
                if (config.lint) {
                    Promise.resolve().then(function () {
                        config.lint(module);
                    });
                }
                throw error;
            }
        };
    };

    Require.exposedConfigs = [
        "paths",
        "mappings",
        "location",
        "packageDescription",
        "packages",
        "modules"
    ];

    //The ShebangCompiler doesn't make sense on the client side
    if (typeof window !== "undefined") {
        Require.makeCompiler = function(config) {
            return Require.JsonCompiler(
                config,
                Require.DependenciesCompiler(
                    config,
                    Require.LintCompiler(
                        config,
                        Require.Compiler(config)
                    )
                )
            );
        };
    }
    else {
        Require.makeCompiler = function(config) {
            return Require.JsonCompiler(
                config,
                Require.ShebangCompiler(
                    config,
                    Require.DependenciesCompiler(
                        config,
                        Require.LintCompiler(
                            config,
                            Require.Compiler(config)
                        )
                    )
                )
            );
        };
    }

    Require.JsonCompiler = function (config, compile) {
        var jsonPattern = /\.json$/;
        return function (module) {
            var json = (module.location || "").match(jsonPattern);
            if (json) {
                module.exports = JSON.parse(module.text);
				//module.text = null;
                return module;
            } else {
				var result = compile(module);
				//module.text = null;
                return result;
            }
        };
    };

    // Built-in loader "middleware":

    // Using mappings hash to load modules that match a mapping.
    Require.MappingsLoader = function(config, load) {
        config.mappings = config.mappings || {};
        config.name = config.name;

        // finds a mapping to follow, if any
        return function (id, module) {

            if (Require.isAbsolute(id)) {
                return load(id, module);
            }

            var mappings = config.mappings;
            var prefixes = Object.keys(mappings);
            var length = prefixes.length;

            // TODO: remove this when all code has been migrated off of the autonomous name-space problem
            if (
                config.name !== void 0 &&
                id.indexOf(config.name) === 0 &&
                id.charAt(config.name.length) === "/"
            ) {
                console.warn("Package reflexive module ignored:", id);
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

    Require.LocationLoader = function (config, load) {
        return function (id, module) {
            var path = id;
            var extension = Require.extension(id);
            if (!extension || (
                extension !== "js" &&
                extension !== "json" &&
                config.moduleTypes.indexOf(extension) === -1
            )) {
                path += ".js";
            }
            var location = URL.resolve(config.location, path);
            var result;
            if(config.delegate && config.delegate.packageWillLoadModuleAtLocation) {
                result = config.delegate.packageWillLoadModuleAtLocation(module,location);
            }
            if(result) return result;
            return load(location, module);
        };
    };

    Require.MemoizedLoader = function (config, load) {
        var cache = config.cache = config.cache || Object.create(null);
        return memoize(load, cache);
    };

    var normalizePattern = /^(.*)\.js$/;
    var normalizeId = function (id) {
        var match = normalizePattern.exec(id);
        if (match) {
            return match[1];
        }
        return id;
    };

    var memoize = function (callback, cache) {
        cache = cache || Object.create(null);
        return function (key, arg) {
            //return cache[key] || (cache[key] = Promise.try(callback, [key, arg]));
            return cache[key] || (cache[key] = callback(key, arg));
        };
    };

});
