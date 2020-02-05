/* <copyright>
 This file contains proprietary software owned by Motorola Mobility, Inc.<br/>
 No rights, expressed or implied, whatsoever to this software are provided by Motorola Mobility, Inc. hereunder.<br/>
 (c) Copyright 2012 Motorola Mobility, Inc.  All Rights Reserved.
 </copyright> */
/*global bootstrap,montageDefine:true, self */
/*jshint -W015, evil:true, camelcase:false */
bootstrap("require/worker", function (require) {

    var Require = require("require");
    var Promise = require("promise");
    var URL = require("mini-url");

    var GET = "GET";
    var APPLICATION_JAVASCRIPT_MIMETYPE = "application/javascript";
    var JAVASCRIPT = "javascript";

    // By using a named "eval" most browsers will execute in the global scope.
    // http://www.davidflanagan.com/2010/12/global-eval-in.html
    // Unfortunately execScript doesn't always return the value of the evaluated expression (at least in Chrome)
    var globalEval = /*this.execScript ||*/eval;

    /*jshint evil:true */
    var global = globalEval('this');
    /*jshint evil:false */

    var location;
    Require.getLocation = function() {
        var applicationPath, scriptURL;
        if (!location) {
            scriptURL = self.serviceWorker.scriptURL,
            applicationPath = scriptURL.replace(/\/([\.A-Za-z0-9_-]+)*$/, "") + "/";
            location = URL.resolve(applicationPath, ".");
        }
        return location;
    };

    Require.overlays = ["window", "montage"];

    function shouldTryIndexJS(url) {
        return url.indexOf(jsPreffix) === url.length - 3 && // ends in .js
               url.indexOf(jsIndexPrefix) !== url.length - 9; // does not end in /index.js
    }

    var jsIndexPrefix = '/index.js',
        jsPreffix = '.js';
    function onerror(request, module) {
        var url = request.url,
            retryRequest;
        if (shouldTryIndexJS(url)) {
            url = url.replace(jsPreffix, jsIndexPrefix);
            module.location = url;
            retryRequest = new Request(url);
            retryRequest.promiseHandler = request.promiseHandler;
            read(retryRequest, module);
        } else {
            request.promiseHandler.reject(new Error("Can't fetch " + url));
        }
    }

    function onload(request, responseText, module) {
        var url = request.url;
        if (responseText === null) {
            onerror(request, module);
        } else if (module) {
            module.type = JAVASCRIPT;
            module.text = responseText;
            module.location = url;
            request.promiseHandler.resolve(responseText);
        } else {
            request.promiseHandler.resolve(responseText);
        }
    }

    function RequireRead(url, module) {
        // Montage relies on bluebird-specific methods such
        // as spread() and return() so we must wrap the native
        // fetch promise with a bluebird promise.
        var request = new Request(url);
        return new Promise(function (resolve, reject) {
            request.promiseHandler = {
                reject: reject,
                resolve: resolve
            };
            read(request, module);
        });
    }

    function read(request, module) {
        return fetchText(request).then(function (responseText) {
            onload(request, responseText, module);
        }).catch(function (e) {
            onerror(request, module);
        });
    }


    function fetchText(request) {
        return self.fetch(request).then(function (response) {
            var status = response.status,
                isSuccess = status === 0 || status === 200,
                canReturnEmpty = status === 200;

            return isSuccess ? response.text().then(function (text) {
                return canReturnEmpty ? text :
                       text           ? text :
                                        null;
            }) : null;
        });
    }

    Require.read = RequireRead;

    // For Firebug, evaled code wasn't debuggable otherwise
    // http://code.google.com/p/fbug/issues/detail?id=2198
    // if (global.navigator && global.navigator.userAgent.indexOf("Firefox") >= 0) {
    //     globalEval = new Function("return eval(arguments[0])");
    // }

    var DoubleUnderscore = "__",
        Underscore = "_",
        globalEvalConstantA = "(function ",
        globalEvalConstantB = "(require, exports, module, global) {",
        globalEvalConstantC = "//*/\n})\n//# sourceURL=",
        globalConcatenator = [globalEvalConstantA,undefined,globalEvalConstantB,undefined,globalEvalConstantC,undefined],
        nameRegex = /[^\w\d]/g;

    Require.Compiler = function (config) {
        return function(module) {
            if (module.factory || module.text === void 0) {
                return module;
            }
            if (config.useScriptInjection) {
                throw new Error("Can't use eval.");
            }

            // Here we use a couple tricks to make debugging better in various browsers:
            // TODO: determine if these are all necessary / the best options
            // 1. name the function with something inteligible since some debuggers display the first part of each eval (Firebug)
            // 2. append the "//# sourceURL=location" hack (Safari, Chrome, Firebug)
            //  * http://pmuellr.blogspot.com/2009/06/debugger-friendly.html
            //  * http://blog.getfirebug.com/2009/08/11/give-your-eval-a-name-with-sourceurl/
            //      TODO: investigate why this isn't working in Firebug.
            // 3. set displayName property on the factory function (Safari, Chrome)

            // Prevent method to start with number to avoid Unexpected number
            var displayName = [DoubleUnderscore, module.require.config.name, Underscore, module.id].join('').replace(nameRegex, Underscore);

            globalConcatenator[1] = displayName;
            globalConcatenator[3] = module.text;
            globalConcatenator[5] = module.location;

            module.factory = globalEval(globalConcatenator.join(''));
            module.factory.displayName = displayName;

            module.text = null;
            globalConcatenator[1] = globalConcatenator[3] = globalConcatenator[5] = null;
        };
    };

    Require.FetchLoader = function (config) {
        return function (url, module) {
            return config.read(url, module)
            .then(function (text) {
                 module.type = JAVASCRIPT;
                 module.text = text;
                 module.location = url;
            });
        };
    };

    var definitions = {};
    var getDefinition = function (hash, id) {
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

    var loadIfNotPreloaded = function (location, definition, preloaded) {
        var loadScript = Require.delegate && Require.delegate.loadScript || Require.loadScript;
        // The package.json might come in a preloading bundle. If so, we do not
        // want to issue a script injection. However, if by the time preloading
        // has finished the package.json has not arrived, we will need to kick off
        // a request for the requested script.
        if (preloaded && preloaded.isPending()) {
            preloaded
            .then(function () {
                if (definition.isPending()) {
                    loadScript(location);
                }
            });
        } else if (definition.isPending()) {
            // otherwise preloading has already completed and we don't have the
            // module, so load it
            loadScript(location);
        }
    };

    // global
    montageDefine = function (hash, id, module) {
        getDefinition(hash, id).resolve(module);
    };

    Require.loadScript = function (location) {
        fetchText(location).then(function (responseText) {
            globalEval(responseText);
        });
    };

    // old version
    var loadPackageDescription = Require.loadPackageDescription;
    Require.loadPackageDescription = function (dependency, config) {
        if (dependency.hash) { // use script injection
            var definition = getDefinition(dependency.hash, "package.json");
            var location = URL.resolve(dependency.location, "package.json.load.js");

            loadIfNotPreloaded(location, definition, config.preloaded);

            return definition.get("exports");
        } else {
            // fall back to normal means
            return loadPackageDescription(dependency, config);
        }
    };

    Require.makeLoader = function (config) {
        return Require.ReelLoader(config,
            Require.MappingsLoader(
                config,
                Require.LocationLoader(
                    config,
                    Require.MemoizedLoader(
                        config,
                        Require.FetchLoader(config)
                    )
                )
            )
        );
    };
});
