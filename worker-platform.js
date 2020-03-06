/*jshint node:true, worker:false */
/*global importScripts, PATH_TO_MR, self */

var worker;
(function (require, exports, module) {
    worker = {
        /********************
         * Resolve the url to a script given
         * the base and relative URL
         */
        makeResolve: function () {
            try {

                var testHost = "http://example.org",
                    testPath = "/test.html",
                    resolved = new URL(testPath, testHost).href;

                if (!resolved || resolved !== testHost + testPath) {
                    throw new Error('NotSupported');
                }

                return function (base, relative) {
                    return new URL(relative, base).href;
                };

            } catch (err) {
                return function (base, relative) {
                    return base + relative;
                };
            }
        },

        /********************
         * Load a resource at the given location
         *
         * Note: On a browser the loadCallback is called with the
         *       <script> tag as the argument
         */
        load: function (location, loadCallback) {
            importScripts(location);
            if (loadCallback) {
                loadCallback(location);
            }
        },

        getParams: function () {
            var mainPath, path;
            if (!this._params) {

                if (self.MontageParams) {
                    this._params = Object.assign({}, self.MontageParams);
                } else {
                    mainPath = self.registration.scope.replace(/[^\/]*\.html$/, "");
                    path = PATH_TO_MR;
                    if (!path) {
                        path = mainPath.replace(/[^\/]*\/?$/, "");
                    } else {
                        path = this.resolve(mainPath, path);
                    }
                    this._params = {
                        mrLocation: path
                    };
                }
                if (self.MAIN_MODULE) {
                    this._params.module = self.MAIN_MODULE;
                }
            }
            return this._params;
        },

        bootstrap: function (callback) {
            var Require, Promise, URL;

            var params = this.getParams();

            var resolve = this.resolve;

            function callbackIfReady() {
                if (Require && URL) {
                    callback(Require, Promise, URL);
                }
            }
            self.addEventListener("activate", function () {
                // determine which scripts to load
                var pending = {
                    "promise": "node_modules/bluebird/js/browser/bluebird.min.js",
                    "require": "require.js",
                    "require/worker": "worker.js",
                };
                // miniature module system
                var definitions = {};
                var bootModules = {};

                function bootRequire(id) {
                    if (!bootModules[id] && definitions[id]) {
                        var exports = bootModules[id] = {};
                        bootModules[id] = definitions[id](bootRequire, exports) || exports;
                    }
                    return bootModules[id];
                }

                // execute bootstrap scripts
                function allModulesLoaded() {
                    URL = bootRequire("mini-url");
                    Promise = bootRequire("promise");
                    Require = bootRequire("require");
                    callbackIfReady();
                }

                // register module definitions for deferred,
                // serial execution
                global.bootstrap = function (id, factory) {
                    definitions[id] = factory;
                    delete pending[id];
                    for (var module in pending) {
                        if (pending.hasOwnProperty(module)) {
                            // this causes the function to exit if there are any remaining
                            // scripts loading, on the first iteration.  consider it
                            // equivalent to an array length check
                            return;
                        }
                    }
                    allModulesLoaded();
                };
                if (!global.preload) {
                    var activeWorker = self.serviceWorker || self.registration.active,
                        scriptURL = activeWorker.scriptURL,
                        applicationPath = scriptURL.replace(/\/([\.A-Za-z0-9_-])*$/, "") + "/",
                        mrLocation = resolve(applicationPath, params.mrLocation),
                        promiseLocation = params.promiseLocation || resolve(mrLocation, pending.promise);

                    // Special Case bluebird for now:
                    worker.load(promiseLocation, function() {

                        //global.bootstrap cleans itself from window once all known are loaded. "bluebird" is not known, so needs to do it first
                        global.bootstrap("bluebird", function (mrRequire, exports) {
                            return self.Promise;
                        });

                        global.bootstrap("promise", function (mrRequire, exports) {
                            return self.Promise;
                        });

                        global.bootstrap("mini-url", function (mrRequire, exports) {
                            exports.resolve = resolve;
                        });
                    });

                    // Load other module and skip promise
                    for (var id in pending) {
                        if (pending.hasOwnProperty(id)) {
                            if (id !== 'promise') {
                                worker.load(resolve(mrLocation, pending[id]));
                            }
                        }
                    }
                }
            });
        }

    };
    worker.resolve = worker.makeResolve();
})();
