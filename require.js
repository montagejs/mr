/* global define, exports, require, process, bootstrap */

/*
    Based in part on Motorola Mobility’s Montage
    Copyright (c) 2012, Motorola Mobility LLC. All Rights Reserved.
    3-Clause BSD License
    https://github.com/motorola-mobility/montage/blob/master/LICENSE.md
*/
(function (root, factory) {
    if (typeof bootstrap === 'function') {
        // Montage. Register module.
        bootstrap("require", function (bootRequire, exports) {
            var Promise = bootRequire("promise").Promise;
            var URL = bootRequire("mini-url");
            factory((root.mr = exports), Promise, URL);
        });
    } else if (typeof define === 'function' && define.amd) {
        // AMD. Register as an anonymous module.
        define(['exports', 'bluebird'], function (exports, bluebird) {
            factory((root.mr = exports), bluebird);
        });
    } else if (typeof exports === 'object' && typeof exports.nodeName !== 'string') {
        // CommonJS
        var Promise = (require)("bluebird");
        var URL = (require)('url');
        factory((root.mr = exports), Promise, URL);
    } else {
        // Browser globals
        var Promise = null; //root.Promise 
        var URL = null; //root.URL
        factory((root.mr = {}), Promise, URL);
    }
}(this, function (exports, Promise, URL) {

    // reassigning causes eval to not use lexical scope.
    var globalEval = eval,
        /*jshint evil:true */
        global = globalEval('this');
        /*jshint evil:false */

    // Non-CommonJS Promise
    Promise.prototype['finally'] = Promise.prototype['finally'] || function finallyPolyfill(callback) {
        var constructor = this.constructor;
        return this.then(function(value) {
                return constructor.resolve(callback()).then(function() {
                    return value;
                });
            }, function(reason) {
                return constructor.resolve(callback()).then(function() {
                    throw reason;
                });
            });
    };

    Promise['try'] = Promise['try'] || function tryPofyfill(callback, args) {
        return new Promise(function (resolve, reject) {
            try {
                resolve(callback.apply(callback, args));
            } catch (err) {
                console.error(err);
                reject(err);
            }
        });
    };

    URL = URL || {};
    URL.resolve = URL.resolve || (function makeResolve() {
        var isAbsolutePattern = /^[\w\-]+:/;
        var baseElement = document.querySelector("base"),
            existingBaseElement = baseElement;

        if (!existingBaseElement) {
            baseElement = document.createElement("base");
            baseElement.href = "";
        }

        return function (base, relative) {

            base = String(base);

            var resolved, restore,
                head = document.querySelector("head"),
                relativeElement = document.createElement("a");

            if (!existingBaseElement) {
                head.appendChild(baseElement);
            }

            if (!isAbsolutePattern.test(base)) {
                throw new Error("Can't resolve " + JSON.stringify(relative) + " relative to " + JSON.stringify(base));
            }

            restore = baseElement.href;
            baseElement.href = base;
            relativeElement.href = relative;
            resolved = relativeElement.href;
            baseElement.href = restore;
            if (!existingBaseElement) {
                head.removeChild(baseElement);
            }

            return resolved;
        };
    }());
    
    // Non-CommonJS Map
    var Map;
    if (!global.Map) {
        Map = function _Map() {
            this._content = Object.create(null);
        };
        Map.prototype.constructor = Map;
        Map.prototype.set = function(key,value) {
            this._content[key] = value;
            return this;
        };
        Map.prototype.get = function(key) {
            return this.hasOwnProperty.call(this._content,key) ? this._content[key] : null;
        };
        Map.prototype.has = function(key) {
            return  key in this._content;
        };
    }
    else {
        Map = global.Map;
    }

    var Module = function Module() {};
    Module.prototype.id = null;
    Module.prototype.display = null;
    Module.prototype.require = null;
    Module.prototype.factory = void 0;
    Module.prototype.exports = void 0;
    Module.prototype.redirect = void 0;
    Module.prototype.location = null;
    Module.prototype.directory = null;
    Module.prototype.injected = false;
    Module.prototype.mappingRedirect = void 0;
    Module.prototype.type = null;
    Module.prototype.text = void 0;
    Module.prototype.dependees = null;
    Module.prototype.extraDependencies = void 0;
    Module.prototype.uuid = null;

    var normalizePattern = /^(.*)\.js$/,
        normalizeIdCache = new Map();
    function normalizeId(id) {
        var result;
        if (!normalizeIdCache.has(id)) {
            result = normalizePattern.exec(id);
            result = ( result ? result[1] : id);
            normalizeIdCache.set(id, result);
        } else {
            result = normalizeIdCache.get(id);
        }
        return result;
    }

    function memoize(callback, cache) {
        function _memoize(key, arg) {
            var result;
            if (!cache.has(key)) {
                result = callback(key, arg);
                cache.set(key, result);
            } else {
                result = cache.get(key);
            }
            return result;
        }
        return _memoize;
    }

    function endsWith(string, search, position) {
        var stringLength = string.length;
        var searchString = String(search);
        var searchLength = searchString.length;
        var pos = stringLength;

            if (position !== undefined) {
                // `ToInteger`
                pos = position ? Number(position) : 0;
                if (pos !== pos) { // better `isNaN`
                    pos = 0;
                }
            }

        var end = Math.min(Math.max(pos, 0), stringLength);
        var start = end - searchLength;
        if (start < 0) {
            return false;
        }
        var index = -1;
        while (++index < searchLength) {
            if (string.charCodeAt(start + index) !== searchString.charCodeAt(index)) {
                return false;
            }
        }
        return true;
    }

    // We need to find the best time to flush _resolveStringtoArray and _resolved once their content isn't needed anymore
    var _resolved = new Map();
    var _resolveStringtoArray = new Map();
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
        if (id === "" && baseId === "") {
            return "";
        }
        var resolved = _resolved.get(id) || (_resolved.set(id, (resolved = new Map())) && resolved) || resolved;
        var i, ii;
        if (!(resolved.has(baseId)) || !(id in resolved.get(baseId))) {
            id = String(id);
            var source = _resolveStringtoArray.get(id) || (_resolveStringtoArray.set(id, (source = id.split("/"))) && source) || source,
                parts = _resolveStringtoArray.get(baseId) || (_resolveStringtoArray.set(baseId,(parts = baseId.split("/"))) && parts || parts),
                resolveItem = _resolveItem;

            if (source.length && source[0] === "." || source[0] === "..") {
                for (i = 0, ii = parts.length-1; i < ii; i++) {
                    resolveItem(parts, parts[i], _target);
                }
            }
            for (i = 0, ii = source.length; i < ii; i++) {
                resolveItem(source, source[i], _target);
            }
            if (!resolved.get(baseId)) {
                resolved.set(baseId, new Map());
            }
            resolved.get(baseId).set(id, _target.join("/"));
            _target.length = 0;
        }
        return resolved.get(baseId).get(id);
    }

    var isRelativePattern = /\/$/;
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
        // TODO this has to add a test on version
        if (
            dependency.name &&
                config.registry &&
                    config.registry.has(dependency.name)
        ) {
            dependency.location = config.registry.get(dependency.name);
        }

        // default location
        if (!dependency.location && config.packagesDirectory && dependency.name) {
            dependency.location = URL.resolve(
                config.packagesDirectory,
                dependency.name + "/"
            );
        } else if (!dependency.location) {
            return dependency; // partially completed
        }

        // make sure the dependency location has a trailing slash so that
        // relative urls will resolve properly
        if (!isRelativePattern.test(dependency.location)) {
            dependency.location += "/";
        }

        // resolve the location relative to the current package
        if (!exports.isAbsolute(dependency.location)) {
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
            config.registry.set(dependency.name,dependency.location);
        }

        return dependency;
    }

    function processMappingDependencies(dependencies, mappings) {
        if (dependencies) {
            for(var i=0, keys = Object.keys(dependencies), name;(name = keys[i]);i++) {
                if (!mappings[name]) {
                    // dependencies are equivalent to name and version mappings,
                    // though the version predicate string is presently ignored
                    // (TODO)
                    mappings[name] = {
                        name: name,
                        version: dependencies[name]
                    };
                }
            }
        }
    }

    function inferStrategy(description) {
        // The existence of an _args property in package.json distinguishes
        // packages that were installed with npm version 3 or higher.
        return description._args ? 'flat' : 'nested';
    }

    function inferOverlay(description) {
        return (typeof window !== "undefined" ? ["window", "browser", "montage"] : ["node", "server", "montage"]);
    }

    //
    //
    //

    function configurePackage(location, description, parent) {

        if (!isRelativePattern.test(location)) {
            location += "/";
        }

        var config = Object.create(parent);
        config.name = description.name;
        config.location = location || exports.getLocation();
        config.packageDescription = description;
        config.useScriptInjection = description.useScriptInjection;
        config.strategy = config.strategy || inferStrategy(description);
        config.overlays = config.overlays || inferOverlay(description);
        
        if (description.production !== void 0) {
            config.production = description.production;
        }

        // explicitly mask definitions and modules, which must
        // not apply to child packages
        var modules = config.modules = config.modules || {};

        var registry = config.registry;
        if (config.name !== void 0 && !registry.has(config.name)) {
            registry.set(config.name,config.location);
        }

        // overlay
        var redirects,
            overlay = description.overlay || {};

        // but first, convert "browser" field, as pioneered by Browserify, to
        // an overlay
        if (typeof description.browser === "string") {
            overlay.browser = {
                redirects: {"": description.browser}
            };
        } else if (typeof description.browser === "object") {
            var bk, iBk, countBk,
                browser = description.browser,
                browserKeys = Object.keys(browser);

            overlay.browser = {
                redirects: {}
            };
            redirects = overlay.browser.redirects;
            for(iBk=0;(bk = browserKeys[iBk]);iBk++) {
                if (browser[bk] !== false) {
                    redirects[bk] = browser[bk];
                    countBk++;
                }
            }
        }

        // overlay continued...
        var layer, overlays, engine, name;
        overlays = config.overlays;
        for(var i = 0, countI = overlays.length; i <countI; i++) {
            if ((layer = overlay[(engine = overlays[i])])) {
                for (name in layer) {
                    if (layer.hasOwnProperty(name)) {
                        description[name] = layer[name];
                    }
                }
            }
        }
        delete description.overlay;

        if (config.strategy === 'flat') {
            config.packagesDirectory = URL.resolve(config.mainPackageLocation, "node_modules/");
        } else {
            config.packagesDirectory = URL.resolve(location, "node_modules/");
        }

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
        redirects = description.redirects;
        if (redirects !== void 0) {
            for (name in redirects) {
                if (redirects.hasOwnProperty(name)) {
                    modules[name] = {
                        id: name,
                        redirect: normalizeId(resolve(redirects[name], name)),
                        location: URL.resolve(location, name)
                    };
                }
            }
        }

        // mappings, link this package to other packages.
        var mappings = description.mappings || {};
        // dependencies, devDependencies if not in production
        processMappingDependencies(description.dependencies, mappings);
        if (!config.production) {
            processMappingDependencies(description.devDependencies,mappings);
        }

        // mappings
        for(var m=0, mKeys = Object.keys(mappings);(name = mKeys[m]);m++) {
            mappings[name] = normalizeDependency(
                mappings[name],
                config,
                name
            );
        }
        config.mappings = mappings;

        return config;
    }

    var isLowercasePattern = /^[a-z]+$/;
    exports.makeRequire = function (config) {
        var require, makeRequire;

        // Configuration defaults:
        config = config || {};
        config.cache = config.cache || new Map();
        config.rootLocation = URL.resolve(config.rootLocation || exports.getLocation(), "./");
        config.location = URL.resolve(config.location || config.rootLocation, "./");
        config.paths = config.paths || [config.location];
        config.mappings = config.mappings || {}; // EXTENSION
        config.exposedConfigs = config.exposedConfigs || exports.exposedConfigs;
        config.moduleTypes = config.moduleTypes || ["html", "meta", "mjson"];
        config.makeLoader = config.makeLoader || exports.makeLoader;
        config.load = config.load || config.makeLoader(config);
        config.makeCompiler = config.makeCompiler || exports.makeCompiler;
        config.executeCompiler = config.executeCompiler || exports.executeCompiler;
        config.compile = config.compile || config.makeCompiler(config);
        config.parseDependencies = config.parseDependencies || exports.parseDependencies;
        config.read = config.read || exports.read;

        // Modules: { exports, id, location, directory, factory, dependencies,
        // dependees, text, type }
        var modules = config.modules = config.modules || Object.create(null);

        // produces an entry in the module state table, which gets built
        // up through loading and execution, ultimately serving as the
        // ``module`` free variable inside the corresponding module.
        function getModuleDescriptor(id) {
            var lookupId = isLowercasePattern.test(id) ? id : id.toLowerCase();
            if (!(lookupId in modules)) {
                var aModule = new Module();
                modules[lookupId] = aModule;
                aModule.id = id;
                aModule.display = (config.name || config.location); // EXTENSION
                aModule.display += "#"; // EXTENSION
                aModule.display += id; // EXTENSION
                aModule.require = require;
            }
            return modules[lookupId];
        }

        function extractPrefixFromInjectId(id) {
            var mappings = config.mappings;
            var prefixes = Object.keys(mappings);
            var length = prefixes.length;

            var i, prefix;
            for (i = 0; i < length; i++) {
                prefix = prefixes[i];
                if (
                    id === prefix ||
                    id.indexOf(prefix) === 0 &&
                    id.charAt(prefix.length) === "/"
                ) {
                    return prefix;
                }
            }
        }

        // for preloading modules by their id and exports, useful to
        // prevent wasteful multiple instantiation if a module was loaded
        // in the bootstrapping process and can be trivially injected into
        // the system.
        function inject(id, exports) {
            var module = getModuleDescriptor(id),
                prefix = extractPrefixFromInjectId(id),
                mapping,
                mappingRedirect;

            if (prefix) {
                mapping = config.mappings[prefix];
                if (id.length > prefix.length) {
                    mappingRedirect = id.slice(prefix.length + 1);
                    module.location = URL.resolve(mapping.location, mappingRedirect);
                    // Make sure the submodule is aware of this injection
                    if (typeof mapping.mappingRequire === "undefined") {
                        config.loadPackage(mapping, config)
                            .then(function (mappingRequire) {
                                mapping.mappingRequire = mappingRequire;
                                mappingRequire.inject(mappingRedirect, exports);
                            });
                    } else {
                        mapping.mappingRequire.inject(mappingRedirect, exports);
                    }
                } else {
                    module.location = mapping.location;
                }
            } else {
                module.location = URL.resolve(config.location, id);
            }

            module.exports = exports;
            module.directory = URL.resolve(module.location, "./");
            module.injected = true;
            module.redirect = void 0;
            module.mappingRedirect = void 0;
            module.error = void 0;
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
                //debugger;
                config.compile(module);
                if (module.redirect !== void 0) {
                    module.dependencies = module.dependencies || [];
                    module.dependencies.push(module.redirect);
                }
                if (module.extraDependencies !== void 0) {
                    module.dependencies = module.dependencies || [];
                    Array.prototype.push.apply(module.dependencies, module.extraDependencies);
                }
            });
        }, config.cache);

        // Load a module definition, and the definitions of its transitive
        // dependencies
        exports.deepLoadDebug = false;
        function deepLoad(topId, viaId, loading) {
            // this is a memo of modules already being loaded so we don’t
            // data-lock on a cycle of dependencies.
            loading = loading || Object.create(null);
            // has this all happened before?  will it happen again?
            if (topId in loading) {
                return null; // break the cycle of violence.
            }
            
            loading[topId] = true; // this has happened before
            
            return load(topId, viaId).then(function () {
                // load the transitive dependencies using the magic of
                // recursion.
                var promises, iModule , depId, dependees, iPromise,
                    module = getModuleDescriptor(topId),
                    dependencies =  module.dependencies;

                if (dependencies && dependencies.length > 0) {
                    for(var i=0;(depId = dependencies[i]);i++) {
                        // create dependees set, purely for debug purposes
                        if (exports.deepLoadDebug) {
                             iModule = getModuleDescriptor(depId);
                             dependees = iModule.dependees = iModule.dependees || {};
                             dependees[topId] = true;
                        }
                        if ((iPromise = deepLoad(normalizeId(resolve(depId, topId)), topId, loading))) {
                            /* jshint expr: true */
                            promises ? (promises.push ? promises.push(iPromise) :
                                (promises = [promises, iPromise])) : (promises = iPromise);
                            /* jshint expr: false */
                        }
                    }
                }

                return promises ? (promises.push === void 0 ? promises :
                            Promise.all(promises)) : null;
            }, function (error) {
                getModuleDescriptor(topId).error = error;
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
                error.stack = module.error.stack;
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

            module.exports = {};

            var returnValue;
            try {
                returnValue = config.executeCompiler(module.factory, makeRequire(topId), module.exports, module);
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
            seen = seen || new Map();
            if (seen.has(location)) {
                return null; // break the cycle of violence.
            }
            seen.set(location,true);
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
                    name += "/";
                    name += id1;
                    return name;
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
        makeRequire = function makeRequire(viaId) {

            // Main synchronously executing "require()" function
            var require = function require(id) {
                var topId = normalizeId(resolve(id, viaId));
                return getExports(topId, viaId);
            };
            require.viaId = viaId;

            // Asynchronous "require.async()" which ensures async executation
            // (even with synchronous loaders)
            require.async = function(id) {
                var topId = normalizeId(resolve(id, viaId));
                return deepLoad(topId, viaId).then(function () {
                    return require(topId);
                });
            };

            require.resolve = function (id) {
                return normalizeId(resolve(id, viaId));
            };

            require.getModule = getModuleDescriptor; // XXX deprecated, use:
            require.getModuleDescriptor = getModuleDescriptor;
            require.load = load;
            require.deepLoad = deepLoad;

            require.loadPackage = function (dependency, givenConfig) {
                if (givenConfig) { // explicit configuration, fresh environment
                    return exports.loadPackage(dependency, givenConfig);
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
                exports.injectPackageDescription(location, description, config);
            };

            require.injectPackageDescriptionLocation = function (location, descriptionLocation) {
                exports.injectPackageDescriptionLocation(location, descriptionLocation, config);
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
            for(var i = 0, countI = exposedConfigs.length; i < countI; i++) {
                require[exposedConfigs[i]] = config[exposedConfigs[i]];
            }

            require.config = config;

            require.read = config.read;

            return require;
        };

        return (require = makeRequire("mr"));
    };

    //
    //
    //

    var definitions = {};
    exports.getDefinition = function getDefinition(hash, id) {
        var defHash = definitions[hash] = definitions[hash] || {};
        if (!defHash[id]) {
            var promiseResolve;
            defHash[id] = new Promise(function(resolve, reject) {
                promiseResolve = resolve;
            });
            defHash[id].resolve = promiseResolve;
        }
        return defHash[id];
    };

    exports.define = function montageDefine(hash, id, module) {
        return exports.getDefinition(hash, id).resolve(module);
    };

    // Export to Global 'montageDefine'
    global.montageDefine = exports.define;

    exports.loadScript = function loadScript(location) {
        return new Promise(function (resolve, reject) {
            var script;

            function finallyHandler() {
                // remove clutter
                if (script.parentNode) {
                    script.parentNode.removeChild(script);   
                }
            }

            if (typeof document !== "undefined") {

                script = document.createElement("script");
                script.setAttribute('type', "text/javascript");
                script.setAttribute('async', '');
                script.setAttribute('defer', 'true');
                script.onload = function () {
                    resolve(script);
                    finallyHandler();
                };
                script.onerror = function (err) {
                    reject(new Error("Can't load script " + JSON.stringify(location)));
                    finallyHandler();
                };
                script.setAttribute('src', location);
                document.querySelector("head").appendChild(script);
            } else {
                reject(new Error("document not supported"));
            }  
        });
    };

    exports.loadXHR = function loadXHR(url) {
        return new Promise(function (resolve, reject) {
            var xhr;
            if (typeof XMLHttpRequest !== "undefined") {

                xhr = new XMLHttpRequest();
                if (xhr.overrideMimeType) {
                    xhr.overrideMimeType("application/javascript");
                }

                xhr.onload = function (event) {
                    // Determine if an XMLHttpRequest was successful
                    // Some versions of WebKit return 0 for successful file:// URLs
                    if (xhr.status === 200 || (xhr.status === 0 && xhr.responseText)) {
                        resolve(xhr.responseText);
                    } else if (xhr.status >= 400) {
                        //This clears the response from memory
                        xhr.abort();
                        reject(new Error("Can't XHR " + JSON.stringify(url)));
                    }
                };

                xhr.onerror = function onerror(event) {
                    reject(new Error("Can't XHR " + JSON.stringify(url)));
                    //This clears the response from memory
                    xhr.abort();
                };

                xhr.open("GET", url, true);

                xhr.send(null);

            } else {
                reject(new Error("XMLHttpRequest not supported"));
            }  
        });
    };

    exports.loadIfNotPreloaded = function loadIfNotPreloaded(location, definition, preloaded) {
        // The package.json might come in a preloading bundle. If so, we do not
        // want to issue a script injection. However, if by the time preloading
        // has finished the package.json has not arrived, we will need to kick off
        // a request for the requested script.
        
        //console.log('loadIfNotPreloaded', location);

        if (preloaded && preloaded.isPending()) {
            preloaded.then(function () {
                if (definition.isPending()) {
                    exports.loadScript(location);
                }
            });
        } else if (definition.isPending()) {
            // otherwise preloading has already completed and we don't have the
            // module, so load it
            exports.loadScript(location);
        }
    };

    exports.injectPackageDescription = function (location, description, config) {
        var descriptions =
            config.descriptions =
                config.descriptions || {};
        descriptions[location] = Promise.resolve(description);
    };

    exports.injectLoadedPackageDescription = function (location, packageDescription, config, require) {
        var subconfig = configurePackage(
            location,
            packageDescription,
            config
        );
        var pkg;
        if (typeof require === "function") {
            pkg = require;
        } else {
            if (exports.delegate && exports.delegate.willCreatePackage) {
                pkg = exports.delegate.willCreatePackage(location, packageDescription, subconfig);
            }
            if (!pkg) {
                pkg = exports.makeRequire(subconfig);
                if (exports.delegate && exports.delegate.didCreatePackage) {
                    exports.delegate.didCreatePackage(subconfig);
                }

            }
        }
        config.packages[location] = pkg;
        return pkg;
    };

    exports.injectPackageDescriptionLocation = function (location, descriptionLocation, config) {
        var descriptionLocations =
            config.descriptionLocations =
                config.descriptionLocations || {};
        descriptionLocations[location] = descriptionLocation;
    };

    exports.loadPackageDescription = function (dependency, config) {

        var location; 
        if (dependency.hash) { // use script injection
            var definition = exports.getDefinition(dependency.hash, "package.json");
            location = URL.resolve(dependency.location, "package.json.load.js");
            exports.loadIfNotPreloaded(location, definition, config.preloaded);
            return definition.get("exports");
        } else {
            location = dependency.location;
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

                if (exports.delegate) {
                    promise = exports.delegate.requireWillLoadPackageDescriptionAtLocation(descriptionLocation,dependency, config);
                }
                if (!promise) {
                    promise = (config.read || exports.read)(descriptionLocation);
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
        }
    };

    exports.loadPackage = function (dependency, config, packageDescription) {

        //console.log('loadPackage', dependency);
        
        config = config || {
            location: URL.resolve(exports.getLocation(), dependency)
        };

        dependency = normalizeDependency(dependency, config);

        if (!dependency.location) {
            throw new Error("Can't find dependency: " + JSON.stringify(dependency));
        }

        var location = dependency.location;
        config = Object.create(config || null);
        var loadingPackages = config.loadingPackages = config.loadingPackages || {};
        var loadedPackages = config.packages = {};
        var registry = config.registry = config.registry || new Map();
        config.mainPackageLocation = config.mainPackageLocation || location;

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
                loadingPackages[location] = exports.loadPackageDescription(dependency, config)
                .then(function (packageDescription) {
                    return exports.injectLoadedPackageDescription(location, packageDescription, config);
                });
            }
            return loadingPackages[location];
        };

        var pkg;
        if (typeof packageDescription === "object") {
            pkg = exports.injectLoadedPackageDescription(location, packageDescription, config);
        }
        else {
            pkg = config.loadPackage(dependency);
        }
        if (typeof pkg.then === "function") {
            pkg = pkg.then(function (pkg) {
                pkg.registry = registry;
                return pkg;
            });
        } else {
            pkg.registry = registry;
        }
        pkg.location = location;
        pkg.async = function (id, callback) {
            return pkg.then(function (require) {
                return require.async(id, callback);
            });
        };

        return pkg;
    };

    // Resolves CommonJS module IDs (not paths)
    exports.resolve = resolve;

    var extensionPattern = /\.([^\/\.]+)$/;
    exports.extension = function (path) {
        var match = extensionPattern.exec(path);
        if (match) {
            return match[1];
        }
    };

    // Tests whether the location or URL is a absolute.
    var isAbsolutePattern = /^[\w\-]+:/;
    exports.isAbsolute = function isAbsolute(location) {
        return isAbsolutePattern.test(location);
    };

    // Extracts dependencies by parsing code and looking for "require" (currently using a simple regexp)
    var requirePattern = /(?:^|[^\w\$_.])require\s*\(\s*["']([^"']*)["']\s*\)/g,
        escapeSimpleComment = /^\/\/.*/gm,
        escapeMultiComment = /^\/\*[\S\s]*?\*\//gm;

    // exports.parseDependencies = function parseDependencies(factory) {
    //    // Clear commented require calls
    //    factory = factory.replace(escapeSimpleComment, '')
    //        .replace(escapeMultiComment, '');
    //
    //     var o = {};
    //     String(factory).replace(requirePattern, function(_, id) {
    //         o[id] = true;
    //     });
    //     return Object.keys(o);
    // };

    // exports.parseDependencies = function parseDependencies(factory) {
    //    // Clear commented require calls
    //    factory = factory.replace(escapeSimpleComment, '')
    //        .replace(escapeMultiComment, '');
    //
    //     var o = [];
    //     String(factory).replace(requirePattern, function(_, id) {
    //         if (o.indexOf(id) === -1) {
    //             o.push(id);
    //         }
    //     });
    //     return o;
    // };

    exports.parseDependencies = function parseDependencies(factory) {

        // Clear commented require calls
        factory = factory.replace(escapeSimpleComment, '')
            .replace(escapeMultiComment, '');

        var o = [], myArray;
        while ((myArray = requirePattern.exec(factory)) !== null) {
            o.push(myArray[1]);
        }
        return o;
    };


    // Built-in compiler/preprocessor "middleware":

    exports.DependenciesCompiler = function(config, compile) {
        return function(module) {
            if (!module.dependencies && module.text !== void 0) {
                module.dependencies = config.parseDependencies(module.text);
            }
            compile(module);
            if (module && !module.dependencies) {
                if (module.text || module.factory) {
                    module.dependencies = exports.parseDependencies(module.text || module.factory);
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
    exports.ShebangCompiler = function(config, compile) {
        // The ShebangCompiler doesn't make sense on the client side
        if (typeof window !== "undefined") {
            return function (module) {
                compile(module);
            };
        } else {
            return function (module) {

                if (module.text) {
                    module.text = module.text.replace(shebangPattern, shebangCommented);
                }
                compile(module);
                //module.text = null;
            };   
        }
    };

    exports.LintCompiler = function(config, compile) {
        return function(module) {
            try {
                compile(module);
            } catch (error) {
                error.message = error.message + " in " + module.location;
                console.log(error);
                if (config.lint) {
                    Promise.resolve().then(function () {
                        config.lint(module);
                    });
                }
                throw error;
            }
        };
    };

    exports.exposedConfigs = [
        "paths",
        "mappings",
        "location",
        "packageDescription",
        "packages",
        "modules"
    ];

    exports.makeCompiler = function(config) {
        return exports.MetaCompiler(
            config,
            exports.SerializationCompiler(
                config,
                exports.TemplateCompiler(
                    config,
                    exports.JsonCompiler(
                        config,
                        exports.ShebangCompiler(
                            config,
                            exports.DependenciesCompiler(
                                config,
                                exports.LintCompiler(
                                    config,
                                    exports.Compiler(config)
                                )
                            )
                        )
                    )
                )
            )
        );
    };

    exports.JsonCompiler = function (config, compile) {
        var jsonPattern = /\.json$/;
        return function (module) {
            var json = (module.location || "").match(jsonPattern);
            if (json) {
                if (typeof module.exports !== "object" && typeof module.text === "string") {
                    module.exports = JSON.parse(module.text);
                }
                //module.text = null;
                return module;
            } else {
                var result = compile(module);
                //module.text = null;
                return result;
            }
        };
    };

    /**
     * Allows the .meta and .mjson files to be loaded as json
     * @see Compiler middleware in require/require.js
     * @param config
     * @param compile
     */
    exports.MetaCompiler = function(config, compile) {
        return function(module) {
            if (module.location && (endsWith(module.location, ".meta") || endsWith(module.location, ".mjson"))) {
                module.exports = JSON.parse(module.text);
                return module;
            } else {
                return compile(module);
            }
        };
    };

    /**
     * Allows the reel's html file to be loaded via require.
     *
     * @see Compiler middleware in require/require.js
     * @param config
     * @param compile
     */
    var directoryExpression = /(.*\/)?(?=[^\/]+)/,
        dotHTML = ".html",
        dotHTMLLoadJs = ".html.load.js";

    exports.TemplateCompiler = function(config, compile) {
        return function(module) {
            var location = module.location;

            if (!location) {
                return;
            }

            if (endsWith(location, dotHTML) || endsWith(location, dotHTMLLoadJs)) {
                var match = location.match(directoryExpression);

                if (match) {
                    module.dependencies = module.dependencies || [];
                    module.exports = {
                        directory: match[1],
                        content: module.text
                    };

                    return module;
                }
            }

            compile(module);
        };
    };

    var MontageMetaData = function(require, id, name) {
        this.require = require;
        this.module = id;
        this.property = name;
        //this.aliases = [name];
        //this.isInstance = false;
        return this;
    };

    MontageMetaData.prototype = {
        get moduleId() {
            return this.module;
        },
        get objectName() {
            return this.property;
        },
        get aliases() {
            return this._aliases || (this._aliases = [this.property]);
        },
        _aliases: null,
        isInstance: false
    };


    var _MONTAGE_METADATA = "_montage_metadata",
        reverseReelExpression = /((.*)\.reel)\/\2$/,
        reverseReelFunction = function($0, $1) {
            return $1;
        };

    exports.SerializationCompiler = function(config, compile) {
        return function(module) {
            compile(module);
            if (!module.factory) {
                return;
            }
            var defaultFactory = module.factory;
            module.factory = function(require, exports, module) {
                var returnValue;
                //call it to validate:
                try {
                    returnValue = config.executeCompiler(defaultFactory, require, exports, module);
                } catch (e) {
                    if (e instanceof SyntaxError) {
                        config.lint(module);
                    } else {
                        throw e;
                    }
                }

                if (returnValue !== void 0) {
                    return returnValue;
                }

                var i, object, name,
                    keys = Object.keys(exports);

                for (i = 0, name; (name = keys[i]); i++) {
                    // avoid attempting to initialize a non-object
                    if (((object = exports[name]) instanceof Object)) {
                        // avoid attempting to reinitialize an aliased property
                        //jshint -W106
                        if (object.hasOwnProperty(_MONTAGE_METADATA) && !object[_MONTAGE_METADATA].isInstance) {
                            object[_MONTAGE_METADATA].aliases.push(name);
                            //object._montage_metadata.objectName = name;
                            //jshint +W106
                        } else if (!Object.isSealed(object)) {
                            object[_MONTAGE_METADATA] = new MontageMetaData(require, module.id.replace(reverseReelExpression, reverseReelFunction), name);
                        }
                    }
                }
            };

            return module;
        };
    };

    // Built-in loader "middleware":

    // Using mappings hash to load modules that match a mapping.
    exports.MappingsLoader = function(config, load) {
        config.mappings = config.mappings || {};
        config.name = config.name;

        // finds a mapping to follow, if any
        return function (id, module) {

            if (exports.isAbsolute(id)) {
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
            

            function loadMapping(mappingRequire) {
                var rest = id.slice(prefix.length + 1);
                config.mappings[prefix].mappingRequire = mappingRequire;
                module.mappingRedirect = rest;
                module.mappingRequire = mappingRequire;
                return mappingRequire.deepLoad(rest, config.location);
            }

            for (i = 0; i < length; i++) {
                prefix = prefixes[i];
                if (
                    id === prefix || (
                        id.indexOf(prefix) === 0 &&
                            id.charAt(prefix.length) === "/"
                    )
                ) {
                    return config.loadPackage(mappings[prefix], config).then(loadMapping);
                }
            }
            return load(id, module);
        };
    };

    exports.LocationLoader = function (config, load) {
        function locationLoader(id, module) {
            var location, result,
                path = id || 'index', // TODO check package.json#files[0]
                config = locationLoader.config,
                extension = exports.extension(id);
            if (
                !extension || (
                    extension !== "js" &&
                        extension !== "json" &&
                            config.moduleTypes.indexOf(extension) === -1
                )
            ) {
                path += ".js";
            }

            location = module.location = URL.resolve(config.location, path);
            if (config.delegate && config.delegate.packageWillLoadModuleAtLocation) {
                result = config.delegate.packageWillLoadModuleAtLocation(module,location);
            }
            return result ? result : load(location, module);
        }
        locationLoader.config = config;
        return locationLoader;
    };

    exports.MemoizedLoader = function (config, load) {
        return memoize(load, config.cache);
    };

    /**
     * Allows reel directories to load the contained eponymous JavaScript
     * module.
     * @see Loader middleware in require/require.js
     * @param config
     * @param loader the next loader in the chain
     */
    var reelExpression = /([^\/]+)\.reel$/,
        dotREEL = ".reel",
        SLASH = "/";
    exports.ReelLoader = function(config, load) {
        return function reelLoader(id, module) {
            if (endsWith(id, dotREEL)) {
                module.redirect = id;
                module.redirect += SLASH;
                module.redirect += reelExpression.exec(id)[1];
                return module;
            } else {
                return load(id, module);
            }
        };
    };

    //
    // Location
    //

    var location;
    exports.getLocation = function () {
      if (!location) {
            if (typeof document !== 'undefined') {
              var base = document.querySelector("head > base");
              if (base) {
                  location = base.href;
              } else {
                  location = window.location;
              }
            } else if (typeof process !== "undefined") {
                location = "file:///" + process.cwd() + "/";
            }

            location = URL.resolve(location, ".");
        }
        return location;
    };

    exports.locationToPath = function locationToPath(location) {
        var parsed = URL.parse(location);
        return parsed.path;
    };

    exports.filePathToLocation = function filePathToLocation(path) {
        return URL.resolve(exports.getLocation(), path);
    };  

    var directoryPathToLocationPattern = !/\/$/;
    exports.directoryPathToLocation = function directoryPathToLocation(path) {
        if (directoryPathToLocationPattern.test(path)) {
            path += "/";
        }
        path = exports.filePathToLocation(path);
        return path;
    };

    //
    //
    //

    exports.read = function read(location) {
        return new Promise(function (resolve, reject) {
            if (typeof XMLHttpRequest !== "undefined") {
                return exports.loadXHR(location).then(resolve, reject);
            } else if (typeof process !== "undefined") {
                var path = exports.locationToPath(location);
                var FS = require("fs");
                FS.readFile(path, "utf-8", function (error, text) {
                    if (error) {
                        reject(new Error(error));
                    } else {
                        resolve(text);
                    }
                });
            } else {
                reject(new Error("Environment not supported"));
            }
        });
    };

    //
    // Compiler
    //

    // Compiles module text into a function.
    // Can be overriden by the platform to make the engine aware of the source path. Uses sourceURL hack by default.
    exports.Compiler = function Compiler(config) {
        config.scope = config.scope || {};
        var names = ["require", "exports", "module", "global", "__filename", "__dirname"];
        var scopeNames = Object.keys(config.scope);
        names.push.apply(names, scopeNames);

        return function (module) {
            if (module.factory || module.text === void 0) {
                return module;
            } else if (config.useScriptInjection) {
                throw new Error("Can't use eval.");
            } else if (
                module.text !== void 0 &&
                module.type === "javascript"
            ) {

                // new Function will have its body reevaluated at every call, hence using eval instead
                // https://developer.mozilla.org/en/JavaScript/Reference/Functions_and_function_scope
                var factoryArgs = names.concat([module.text + "\n//*/\n//# sourceURL=" + module.location]);
                module.factory = Function.apply(global, factoryArgs);
            }
        };
    };

    exports.executeCompiler = function (factory, require, exports, module) {
        var returnValue;

        module.directory = URL.resolve(module.location, "./"); 
        module.filename = URL.resolve(module.location, module.location);
        module.exports = exports || {};
       
        // Execute the factory function:
        // TODO use config.scope
        returnValue = factory.call(global,
            require,            // require
            exports,     // exports
            module,             // module
            global,
            module.filename,     // __filename
            module.directory     // __dirname
        );

        return returnValue;
    };

    //
    // Loaders
    //

    var isJavaScriptFilePattern = /\.js$/;
    exports.ScriptLoader = function ScriptLoader(config) {
        var hash = config.packageDescription.hash;
        return function (location, module) {
            return Promise.try(function () {

                // short-cut by predefinition
                if (definitions[hash] && definitions[hash][module.id]) {
                    return definitions[hash][module.id];
                }

                if (isJavaScriptFilePattern.test(location)) {
                    location = location.replace(isJavaScriptFilePattern, ".load.js");
                } else {
                    location += ".load.js";
                }

                var definition = exports.getDefinition(hash, module.id);
                exports.loadIfNotPreloaded(location, definition, config.preloaded);

                return definition;
            }).then(function (definition) {
                delete definitions[hash][module.id];
                for (var name in definition) {
                    if (definition.hasOwnProperty(name)) {
                        module[name] = definition[name];   
                    }
                }
                module.location = location;
                module.directory = URL.resolve(location, ".");
            });
        };
    };

    exports.XhrLoader = function XhrLoader(config) {
        return function XhrRequire(url, module) {
            return config.read(url).then(function (text) {
                module.type = 'javascript';
                module.text = text;
                module.location = url;
            });
        };
    };

    exports.CommonJSLoader = function CommonJSLoader(config) {
        return function CommonJSRequire(location, module) {
            return config.read(location)
            .then(function (text) {
                module.type = "javascript";
                module.text = text;
                module.location = location;
            }, function (reason, error, rejection) {
                module.type = "native";
                module.exports = require(module.id);
                module.location = location;
                return module;
            });
        };
    };

    exports.AMDLoader = function AMDLoader(config) {
        return function AMDRequire(location, module) {
            var id = location.slice(config.location.length);
            id = id.substr(0, id.lastIndexOf('.'));
            module.type = "amd";
            module.location = location;
            return new Promise(function (resolve, reject) {
                return define([id], resolve, reject);
            }).then(function (definition) {
                module.exports = definition;
                return module;
            });
        };
    };

    //
    //
    //

    exports.Loader = function Loader(config) {
        var loader;
        if (typeof define === 'function' && define.amd) {
            loader = exports.AMDLoader;
        } else if (typeof module === 'object' && module.exports) {
            loader = exports.CommonJSLoader;
        } else if (typeof window !== "undefined") {
            if (config.useScriptInjection) {
                loader = exports.ScriptLoader;
            } else {
                loader = exports.XhrLoader;
            }   
        }
        return loader(config);
    };

    exports.makeLoader = function makeLoader(config) {
        return exports.ReelLoader(config,
            exports.MappingsLoader(
                config,
                exports.LocationLoader(
                    config,
                    exports.MemoizedLoader(
                        config,
                        exports.Loader(
                            config
                        )
                    )
                )
            )
        );
    };
}));