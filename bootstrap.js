/* global define, exports, require, process, window, document*/
/*
    Based in part on Motorola Mobility’s Montage
    Copyright (c) 2012, Motorola Mobility LLC. All Rights Reserved.
    3-Clause BSD License
    https://github.com/motorola-mobility/montage/blob/master/LICENSE.md
*/
(function (root, factory) {
    if (typeof define === 'function' && define.amd) {
        // AMD. Register as an anonymous module.
        define(['exports', 'bluebird'], function (exports, bluebird) {
            factory((root.mrBootstrap = exports), bluebird);
        });
    } else if (typeof exports === 'object' && typeof exports.nodeName !== 'string') {
        // CommonJS
        var urlRequire = (typeof URL !== 'undefined' ? URL : (require)('url'));
        factory(exports, require('bluebird'), urlRequire);
    } else {
        // Browser globals
        factory((root.mrBootstrap = {}), root.Promise, root.URL);
    }
}(this, function (exports, Promise, URL) {
    "use strict";

    // reassigning causes eval to not use lexical scope.
    var globalEval = eval,
        /*jshint evil:true */
        global = globalEval('this');
        /*jshint evil:false */

    exports.initBrowser = function initBrowser() {

        var Require;

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
                script.setAttribute('src', location);
                script.onload = function () {
                    callback(null, script);
                    finallyHandler();
                };
                script.onerror = function (err) {
                    callback(err, script);
                    finallyHandler();
                };
                document.querySelector("head").appendChild(script);
            } else {
                errorCallback(new Error("document not supported"));
                finallyHandler();
            }   
        }

        function resolve(base, relative) {
            return new URL(relative, base).href;
        }
        
        var paramsCache,
            dataAttrPattern = /^data-(.*)$/,
            boostrapPattern = /^(.*)bootstrap.js(?:[\?\.]|$)/i,
            letterAfterDashPattern = /-([a-z])/g;

        return  {
            getParams: function getParams() {
                var i, j,
                    match, script, scripts,
                    mrLocation, attr, name;

                if (!paramsCache) {
                    paramsCache = {};
                    // Find the <script> that loads us, so we can divine our
                    // parameters from its attributes.
                    scripts = document.getElementsByTagName("script");
                    for (i = 0; i < scripts.length; i++) {
                        script = scripts[i];
                        if (script.src && (match = script.src.match(boostrapPattern))) {
                            mrLocation = match[1];
                        }
                        if (script.hasAttribute("data-mr-location")) {
                            mrLocation = resolve(window.location, script.getAttribute("data-mr-location"));
                        }
                        if (mrLocation) {
                            if (script.dataset) {
                                for (name in script.dataset) {
                                    if (script.dataset.hasOwnProperty(name)) {
                                        paramsCache[name] = script.dataset[name];
                                    }
                                }
                            } else if (script.attributes) {
                                for (j = 0; j < script.attributes.length; j++) {
                                    attr = script.attributes[j];
                                    match = attr.name.match(dataAttrPattern);
                                    if (match) {
                                        paramsCache[match[1].replace(letterAfterDashPattern, upperCaseChar)] = attr.value;
                                    }
                                }
                            }
                            // Permits multiple bootstrap.js <scripts>; by
                            // removing as they are discovered, next one
                            // finds itself.
                            script.parentNode.removeChild(script);
                            paramsCache.mrLocation = mrLocation;
                            break;
                        }
                    }
                }

                return paramsCache;
            },
            bootstrap: function (callback) {

                var self = this,
                    params = self.getParams();

                // determine which scripts to load
                var dependencies = {
                    "promise": "node_modules/bluebird/js/browser/bluebird.min.js",
                    "require": "./require.js"
                };

                // miniature module system
                var bootModules = {};
                var definitions = {};
                function bootRequire(id) {
                    if (!bootModules[id] && definitions[id]) {
                        var exports = bootModules[id] = {};
                        bootModules[id] = definitions[id](bootRequire, exports) || exports;
                    }
                    return bootModules[id];
                }

                // register module definitions for deferred, serial execution
                global.bootstrap = function (id, factory) {
                    definitions[id] = factory;
                    delete dependencies[id];
                    for (id in dependencies) {
                        if (dependencies.hasOwnProperty(id)) {
                            // this causes the function to exit if there are any remaining
                            // scripts loading, on the first iteration.  consider it
                            // equivalent to an array length check
                            return;
                        }
                    }

                    // if we get past the for loop, bootstrapping is complete.  get rid
                    // of the bootstrap function and proceed.
                    delete global.bootstrap;

                    //
                    var Promise = bootRequire("promise"),
                        Require = bootRequire("require"),
                        miniURL = bootRequire("mini-url");
                        
                    callback(Require, Promise, miniURL);
                };

                // one module loaded for free, for use in require.js, browser.js
                global.bootstrap("mini-url", function (mrRequire, exports) {
                    exports.resolve = resolve;
                });

                // Load other module and skip promise
                for (var id in dependencies) {
                    if (dependencies.hasOwnProperty(id)) {
                        loadScript(resolve(params.mrLocation, dependencies[id]), function (id) {
                            if (id === 'promise') {
                                global.bootstrap(id, function (mrRequire, exports) {
                                    exports.Promise = window.Promise; 
                                });
                            }
                        }.bind(null, id));
                    }
                } 
            }
        }
    };

    exports.initServer = function initServer() {
        
        var mrRequire = (require)('./require');

        return  {
            loadPackage: mrRequire.loadPackage,

            getParams: function () {
                
            },
            bootstrap: function (callback) {

                var command = process.argv.slice(0, 3);
                var args = process.argv.slice(2);
                var program = args.shift();

                callback(mrRequire, Promise, URL);
            }
        }
    };

    var platform;
    exports.getPlatform = function () {
        if (platform) {
            return platform;
        } else if (typeof window !== "undefined" && window && window.document) {
            platform = exports.initBrowser();
        } else if (typeof process !== "undefined") {
            platform = exports.initServer();
        } else {
            throw new Error("Platform not supported.");
        }
        return platform;
    };

    exports.loadPackage = function (location, config) {
        var platform = exports.getPlatform();
        return new Promise(function (resolve, reject) {
            platform.bootstrap(function (mrRequire, Promise, URL) {
                return mrRequire.loadPackage(location, config).then(resolve, reject);
            });
        });
    };

    /**
     * Initializes Montage and creates the application singleton if
     * necessary.
     */
    exports.initMontageRequire = function() {
        return exports.getPlatform().bootstrap(function (mrRequire, Promise, URL) {
            
            var config = {},
                params = platform.getParams(),
                applicationModuleId = params.module || "",
                applicationLocation = URL.resolve(mrRequire.getLocation(), params.package || ".");

            // execute the preloading plan and stall the fallback module loader
            // until it has finished
            if (global.preload) {

                var bundleDefinitions = {};
                var getDefinition = function (name) {
                    return bundleDefinitions[name] =
                        bundleDefinitions[name] ||
                            Promise.resolve();
                };
                
                global.bundleLoaded = function (name) {
                    return getDefinition(name).resolve();
                };
                
                var preloading = Promise.resolve();
                config.preloaded = preloading.promise;

                // preload bundles sequentially
                var preloaded = Promise.resolve();
                global.preload.forEach(function (bundleLocations) {
                    preloaded = preloaded.then(function () {
                        return Promise.all(bundleLocations.map(function (bundleLocation) {
                            load(bundleLocation);
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

            mrRequire.loadPackage({
                location: params.mrLocation,
                hash: params.mrHash
            }, config).then(function (mrRequire) {
                mrRequire.inject("mini-url", URL);
                mrRequire.inject("promise", Promise); 
                mrRequire.inject("require", mrRequire);

                if ("autoPackage" in params) {
                    mrRequire.injectPackageDescription(applicationLocation, {});
                }

                return mrRequire.loadPackage({
                    location: applicationLocation,
                    hash: params.applicationHash
                }).then(function (pkg) {

                    // Expose global require and mr
                    global.require = global.mr = pkg;
                    
                    return pkg.async(applicationModuleId);
                });
            });
        });
    };

    if (
        typeof window !== "undefined" || 
            (typeof module === 'object' && module.exports &&
                typeof require !== "undefined" && require.main === module)
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