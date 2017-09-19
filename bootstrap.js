/* global define, exports, require, process, window, document, bootstrap*/
(function (root, factory) {
    if (typeof bootstrap === 'function') {
        // Montage. Register module.
        bootstrap("bootstrap", function (bootRequire, exports) {
            var Promise = bootRequire("promise").Promise;
            var URL = bootRequire("mini-url");
            factory(exports, Promise, URL, bootRequire);
        });
    } else if (typeof exports === 'object' && typeof exports.nodeName !== 'string') {
        // CommonJS
        var Promise = (require)("bluebird");
        var URL = (require)('url');
        var mr = (require)('./require');
        factory(exports, Promise, URL, mr);
    } else if (typeof define === 'function' && define.amd) {
        // AMD. Register as an anonymous module.
        define(['exports', 'bluebird'], function (exports, bluebird) {
            factory((root.mrBootstrap = exports), bluebird);
        });
    } else {
        // Browser globals
        factory((root.Montage = {}), null, root.URL, root.mr);
    }
}(this, function (exports, Promise, miniURL, mr) {
    "use strict";

    // reassigning causes eval to not use lexical scope.
    var globalEval = eval,
        /*jshint evil:true */
        global = globalEval('this');
        /*jshint evil:false */

    function loadScript(location, callback) {
        var script;
        callback = callback || function noop() {};
        function finallyHandler() {
            // remove clutter
            if (script.parentNode) {
                script.parentNode.removeChild(script);   
            }
        }

        if (typeof document !== "undefined") {
            script = document.createElement("script");
            script.setAttribute('async', '');
            script.setAttribute('src', location + '');
            script.onload = function () {
                callback(null, script);
                finallyHandler();
            };
            script.onerror = function (err) {
                callback(new Error("Can't load script " + JSON.stringify(location)), script);
                finallyHandler();
            };
            document.querySelector("head").appendChild(script);
        } else if (typeof require === 'function') {
            var module;
            try {
                module = require(location);
                callback(null, module);
            } catch (err) {
                callback(err, module);
            }
        } else {
            throw new Error("Platform not supported");
        }   
    }

    exports.initBrowser = function initBrowser() {
        
        return  {

            resolveUrl: (function makeResolveUrl() {

                var isAbsolutePattern = /^[\w\-]+:/,
                    baseElement = document.querySelector("base"),
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
            }()),

            _params: null,

            getParams: function getParams() {
                var params = this._params;

                if (!params) {
                    params = this._params = {};
                    
                    // Find the <script> that loads us, so we can divine our
                    // parameters from its attributes.
                    var i, j, match, script, attr, name,
                        paramNamespace = 'mr',
                        boostrapScript ='bootstrap.js',
                        boostrapAttrPattern = /^data-(.*)$/,
                        boostrapPattern = new RegExp('^(.*)' + boostrapScript + '(?:[\?\.]|$)', 'i'),
                        letterAfterDashPattern = /-([a-z])/g,
                        scripts = document.getElementsByTagName("script"),
                        upperCaseChar = function upperCaseChar(_, c) {
                            return c.toUpperCase();
                        };

                    for (i = 0; i < scripts.length; i++) {
                        script = scripts[i];
                        if (script.src && (match = script.src.match(boostrapPattern))) {
                            params.location = match[1];
                        }
                        if (script.hasAttribute("data-" + paramNamespace + "-location")) {
                            params.location = script.getAttribute("data-" + paramNamespace + "-location");
                        }
                        if (params.location) {
                            if (script.dataset) {
                                for (name in script.dataset) {
                                    if (script.dataset.hasOwnProperty(name)) {
                                        params[name] = script.dataset[name];
                                    }
                                }
                            } else if (script.attributes) {
                                for (j = 0; j < script.attributes.length; j++) {
                                    attr = script.attributes[j];
                                    match = attr.name.match(boostrapAttrPattern);
                                    if (match) {
                                        params[match[1].replace(letterAfterDashPattern, upperCaseChar)] = attr.value;
                                    }
                                }
                            }

                            // Legacy
                            params[paramNamespace + 'Location'] = params.location;
                            params[paramNamespace + 'Hash'] = params.hash;

                            // Permits multiple bootstrap.js <scripts>; by
                            // removing as they are discovered, next one
                            // finds itself.
                            script.parentNode.removeChild(script);
                            break;
                        }
                    }
                }

                return params;
            },
            
            loadPackage: function (dependency, config, packageDescription) {
                return mr.loadPackage(dependency, config, packageDescription);
            },

            bootstrap: function (callback) {

                var self = this,
                    params = self.getParams(),
                    location = params.location,
                    resolveUrl = this.resolveUrl;

                // determine which scripts to load
                var dependencies = {
                    "mini-url": {
                        // Preloaded
                        shim: function (bootRequire, exports) {
                            return {
                                resolve: resolveUrl
                            };
                        }
                    },
                    "promise": {
                        global: "Promise",
                        export: "Promise",
                        location: "node_modules/bluebird/js/browser/bluebird.min.js",
                    },
                    "require": {
                        exports: mr, // Preloaded
                        location: "./require.js"
                        //location: "node_modules/mr/require.js",
                    }
                };

                function bootModule(id) {
                    //console.log('bootModule', id, factory);

                    if (!dependencies.hasOwnProperty(id)) {
                        return;
                    }

                    var module = dependencies[id];

                    if (
                        module && 
                            typeof module.exports === "undefined"  && 
                                typeof module.factory === "function"
                    ) {
                        module.exports = module.factory(bootModule, (module.exports = {})) || module.exports;
                    }

                    return module.exports;
                }

                // Save initial bootstrap
                var initalBoostrap = global.bootstrap;

                // register module definitions for deferred, serial execution
                function bootstrapModule(id, factory) {
                    //console.log('bootstrapModule', id, factory);

                    if (!dependencies.hasOwnProperty(id)) {
                        return;
                    }
                    
                    dependencies[id].factory = factory;
                    
                    for (id in dependencies) {
                        if (dependencies.hasOwnProperty(id)) {
                            // this causes the function to exit if there are any remaining
                            // scripts loading, on the first iteration.  consider it
                            // equivalent to an array length check
                            if (typeof dependencies[id].factory === "undefined") {
                                //console.log('waiting for', id);
                                return;
                            }
                        }
                    }

                    // if we get past the for loop, bootstrapping is complete.  get rid
                    // of the bootstrap function and proceed.
                    delete global.bootstrap;

                    // Restore inital Boostrap
                    if (initalBoostrap) {
                        global.bootstrap = initalBoostrap;   
                    }

                    // At least bootModule in order
                    var mrPromise = bootModule("promise").Promise,
                        miniURL = bootModule("mini-url"),
                        mrRequire = bootModule("require");

                    callback(mrRequire, mrPromise, miniURL);
                }

                function bootstrapModuleScript(module, err, script) {
                    if (err) {
                        // Fallback on flat strategy for missing nested module
                        if (module.strategy === 'nested') {
                            module.strategy = 'flat';
                            module.script = resolveUrl(resolveUrl(location, '../../'), module.location);
                            loadScript(module.script, bootstrapModuleScript.bind(null, module));
                        } else {
                            throw err;   
                        }
                    } else if (module.export || module.global) {

                        bootstrapModule(module.id, function (bootRequire, exports) {
                            if (module.export) {
                                exports[module.export] = global[module.global]; 
                            } else {
                                return global[module.global];
                            }
                        });
                    }
                }

                // Expose bootstrap
                global.bootstrap = bootstrapModule;

                // Load other module and skip promise
                for (var id in dependencies) {
                    if (dependencies.hasOwnProperty(id)) {
                        var module = dependencies[id],
                            paramModuleLocation = id + 'Location';

                        if (typeof module === 'string') {
                            module = {
                                id: id,
                                location: module
                            };
                        } else {
                            module.id = id;   
                        }

                        // Update dependency
                        dependencies[id] = module;  
                        // Update locatiom from param
                        module.location = params.hasOwnProperty(paramModuleLocation) ? params[paramModuleLocation] : module.location;

                        // Reset bad exports
                        if (module.exports !== null && module.exports !== void 0) {
                            bootstrapModule(module.id, module.exports);
                        } else if (typeof module.shim !== "undefined") {
                            bootstrapModule(module.id, module.shim);
                        } else {
                            module.strategy = "nested";
                            module.script = resolveUrl(location, module.location);
                            loadScript(module.script, bootstrapModuleScript.bind(null, module));
                        }
                    }
                } 
            }
        };
    };

    exports.initNodeJS = function initServer() {

        var PATH = require("path"),
            FS  = require("fs");

        return  {

            _params: null,

            getParams: function () {
                var params = this._params;

                if (!params) {

                    var paramNamespace = 'mr',
                        location = mr.getLocation(),
                        paramCommand = 'bin/' + paramNamespace;

                    params = this._params = {};
                    params.location = params[paramNamespace + 'Location'] = location;
                    // Detect command line
                    if (
                        typeof process !== "undefined" && 
                            typeof process.argv !== "undefined"
                    ) {

                        var command, module, modulePackage,
                            args = process.argv.slice(1);

                        command = args.shift() || "";

                        // Detect /bin/mr usage
                        if (command.indexOf(paramCommand) === command.length - paramCommand.length) {
                            module = args.shift() || "";

                            if (module.slice(module.length - 1, module.length) !== "/") {
                                module += "/";
                            }

                            params.module = PATH.basename(module);
                            params.package = PATH.dirname(FS.realpathSync(module)) + "/";  
                        }
                    }
                }

                return params; 
            },

            loadPackage: function (dependency, config, packageDescription) {
                return mr.loadPackage(dependency, config, packageDescription);
            },

            bootstrap: function (callback) {
                

                var self = this,
                    params = self.getParams();

                if (params.package) {
                    callback(mr, Promise, miniURL);
                }
            }
        };
    };

    var platform;
    exports.getPlatform = function () {
        if (platform) {
            return platform;
        } else if (typeof window !== "undefined" && window && window.document) {
            platform = exports.initBrowser();
        } else if (typeof exports === 'object' && typeof exports.nodeName !== 'string') {
            platform = exports.initNodeJS();
        } else {
            throw new Error("Platform not supported.");
        }
        return platform;
    };

    exports.loadPackage = function (dependency, config, packageDescription) {
        var platform = exports.getPlatform();
        return platform.loadPackage(dependency, config, packageDescription);
    };

    /**
     * Initializes Montage and creates the application singleton if
     * necessary.
     */
    exports.initMontageRequire = function() {
        var platform = exports.getPlatform();
        return platform.bootstrap(function (mrRequire, mrPromise, miniURL) {

            var config = {},
                params = platform.getParams(),
                location = params.location,
                applicationModuleId = params.module || "",
                applicationLocation = miniURL.resolve(mrRequire.getLocation(), params.package || ".");

            // execute the preloading plan and stall the fallback module loader
            // until it has finished
            if (global.preload) {

                var bundleDefinitions = {};
                var getDefinition = function (name) {
                    return (bundleDefinitions[name] = bundleDefinitions[name] || Promise.resolve());
                };
                
                global.bundleLoaded = function (name) {
                    return getDefinition(name).resolve();
                };
                
                var preloading = Promise.resolve();
                config.preloaded = preloading.promise;

                // preload bundles sequentially
                var preloaded = mrPromise.resolve();
                global.preload.forEach(function (bundleLocations) {
                    preloaded = preloaded.then(function () {
                        return mrPromise.all(bundleLocations.map(function (bundleLocation) {
                            loadScript(bundleLocation);
                            return getDefinition(bundleLocation).promise;
                        }));
                    });
                });

                // then release the module loader to run normally
                preloading.resolve(preloaded.then(function () {
                    delete global.preload;
                    delete global.bundleLoaded;
                }));
            }

            return mrRequire.loadPackage({
                location: params.location,
                hash: params.hash
            }, config).then(function (boostrapRequire) {

                if ("autoPackage" in params) {
                    mrRequire.injectPackageDescription(applicationLocation, {
                        dependencies: {
                            mr: "*"
                        }
                    }, config);
                }

                return boostrapRequire.loadPackage({
                    location: applicationLocation,
                    hash: params.applicationHash
                }).then(function (applicationRequire) {

                    // Self exports
                    applicationRequire.inject("bootstrap", exports);

                    // Default free module
                    applicationRequire.inject("mini-url", miniURL);
                    applicationRequire.inject("promise", mrPromise); 
                    applicationRequire.inject("require", applicationRequire);

                    return applicationRequire.async(applicationModuleId);
                });
            });
        });
    };

    if (
        typeof window !== "undefined" || 
            (typeof module === 'object' && module.exports &&
                typeof require !== "undefined")
    ) {
        if (global.__MONTAGE_REQUIRE_LOADED__) {
            console.warn("MontageRequire already loaded!");
        } else {
            global.__MONTAGE_REQUIRE_LOADED__ = true;
            exports.initMontageRequire();
            console.warn("MontageRequire ready!");
        }
    } else {
        // may cause additional exports to be injected:
        exports.getPlatform();
    }
}));