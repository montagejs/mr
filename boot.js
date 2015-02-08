global = this;

(function (modules) {

    // Bundle allows the run-time to extract already-loaded modules from the
    // boot bundle.
    var bundle = {};

    // Unpack module tuples into module objects.
    for (var i = 0; i < modules.length; i++) {
        var module = modules[i];
        modules[i] = new Module(module[0], module[1], module[2], module[3]);
        bundle[module[0]] = bundle[module[1]] || {};
        bundle[module[0]][module[1]] = module;
    }

    function Module(name, id, map, factory) {
        // Package name and module identifier are purely informative.
        this.name = name;
        this.id = id;
        // Dependency map and factory are used to instantiate bundled modules.
        this.map = map;
        this.factory = factory;
    }

    Module.prototype.getExports = function () {
        var module = this;
        if (module.exports === void 0) {
            module.exports = {};
            var require = function (id) {
                var index = module.map[id];
                var dependency = modules[index];
                if (!dependency)
                    throw new Error("Bundle is missing a dependency: " + id);
                return dependency.getExports();
            }
            module.exports = module.factory(require, module.exports, module) || module.exports;
        }
        return module.exports;
    };

    // Communicate the bundle to all bundled modules
    Module.prototype.bundle = bundle;

    return modules[0].getExports();
})((function (global){return[["mr","boot/require",{"../require":4,"url":8,"q":14,"./script-params":3},function (require, exports, module){

// mr boot/require
// ---------------

"use strict";

var Require = require("../require");
var URL = require("url");
var Q = require("q");
var getParams = require("./script-params");

module.exports = boot;
function boot(preloaded, params) {
    params = params || getParams("boot.js");

    var config = {preloaded: preloaded};
    var applicationLocation = URL.resolve(window.location, params.package || ".");
    var moduleId = params.module || "";

    if ("autoPackage" in params) {
        Require.injectPackageDescription(applicationLocation, {});
    }

    return Require.loadPackage({
        location: applicationLocation,
        hash: params.applicationHash
    }, {
        bundle: module.bundle
    })
    .then(function (applicationRequire) {
        return applicationRequire.loadPackage({
            name: "mr",
            location: params.mrLocation,
            hash: params.mrHash
        })
        .then(function (mrRequire) {
            return mrRequire.loadPackage({
                name: "q",
                location: params.qLocation,
                hash: params.qHash
            })
            .then(function (qRequire) {
                qRequire.inject("q", Q);
                mrRequire.inject("mini-url", URL);
                mrRequire.inject("require", Require);
                return applicationRequire.async(moduleId);
            });
        });
    });

}

}],["asap","browser-asap",{"./raw":2},function (require, exports, module){

// asap browser-asap
// -----------------

"use strict";

// rawAsap provides everything we need except exception management.
var rawAsap = require("./raw");
// RawTasks are recycled to reduce GC churn.
var freeTasks = [];
// We queue errors to ensure they are thrown in right order (FIFO).
// Array-as-queue is good enough here, since we are just dealing with exceptions.
var pendingErrors = [];
var requestErrorThrow = rawAsap.makeRequestCallFromTimer(throwFirstError);

function throwFirstError() {
    if (pendingErrors.length) {
        throw pendingErrors.shift();
    }
}

/**
 * Calls a task as soon as possible after returning, in its own event, with priority
 * over other events like animation, reflow, and repaint. An error thrown from an
 * event will not interrupt, nor even substantially slow down the processing of
 * other events, but will be rather postponed to a lower priority event.
 * @param {{call}} task A callable object, typically a function that takes no
 * arguments.
 */
module.exports = asap;
function asap(task) {
    var rawTask;
    if (freeTasks.length) {
        rawTask = freeTasks.pop();
    } else {
        rawTask = new RawTask();
    }
    rawTask.task = task;
    rawAsap(rawTask);
}

// We wrap tasks with recyclable task objects.  A task object implements
// `call`, just like a function.
function RawTask() {
    this.task = null;
}

// The sole purpose of wrapping the task is to catch the exception and recycle
// the task object after its single use.
RawTask.prototype.call = function () {
    try {
        this.task.call();
    } catch (error) {
        if (asap.onerror) {
            // This hook exists purely for testing purposes.
            // Its name will be periodically randomized to break any code that
            // depends on its existence.
            asap.onerror(error);
        } else {
            // In a web browser, exceptions are not fatal. However, to avoid
            // slowing down the queue of pending tasks, we rethrow the error in a
            // lower priority turn.
            pendingErrors.push(error);
            requestErrorThrow();
        }
    } finally {
        this.task = null;
        freeTasks[freeTasks.length] = this;
    }
};
}],["asap","browser-raw",{},function (require, exports, module){

// asap browser-raw
// ----------------

"use strict";

// Use the fastest means possible to execute a task in its own turn, with
// priority over other events including IO, animation, reflow, and redraw
// events in browsers.
//
// An exception thrown by a task will permanently interrupt the processing of
// subsequent tasks. The higher level `asap` function ensures that if an
// exception is thrown by a task, that the task queue will continue flushing as
// soon as possible, but if you use `rawAsap` directly, you are responsible to
// either ensure that no exceptions are thrown from your task, or to manually
// call `rawAsap.requestFlush` if an exception is thrown.
module.exports = rawAsap;
function rawAsap(task) {
    if (!queue.length) {
        requestFlush();
        flushing = true;
    }
    // Equivalent to push, but avoids a function call.
    queue[queue.length] = task;
}

var queue = [];
// Once a flush has been requested, no further calls to `requestFlush` are
// necessary until the next `flush` completes.
var flushing = false;
// `requestFlush` is an implementation-specific method that attempts to kick
// off a `flush` event as quickly as possible. `flush` will attempt to exhaust
// the event queue before yielding to the browser's own event loop.
var requestFlush;
// The position of the next task to execute in the task queue. This is
// preserved between calls to `flush` so that it can be resumed if
// a task throws an exception.
var index = 0;
// If a task schedules additional tasks recursively, the task queue can grow
// unbounded. To prevent memory exhaustion, the task queue will periodically
// truncate already-completed tasks.
var capacity = 1024;

// The flush function processes all tasks that have been scheduled with
// `rawAsap` unless and until one of those tasks throws an exception.
// If a task throws an exception, `flush` ensures that its state will remain
// consistent and will resume where it left off when called again.
// However, `flush` does not make any arrangements to be called again if an
// exception is thrown.
function flush() {
    while (index < queue.length) {
        var currentIndex = index;
        // Advance the index before calling the task. This ensures that we will
        // begin flushing on the next task the task throws an error.
        index = index + 1;
        queue[currentIndex].call();
        // Prevent leaking memory for long chains of recursive calls to `asap`.
        // If we call `asap` within tasks scheduled by `asap`, the queue will
        // grow, but to avoid an O(n) walk for every task we execute, we don't
        // shift tasks off the queue after they have been executed.
        // Instead, we periodically shift 1024 tasks off the queue.
        if (index > capacity) {
            // Manually shift all values starting at the index back to the
            // beginning of the queue.
            for (var scan = 0; scan < index; scan++) {
                queue[scan] = queue[scan + index];
            }
            queue.length -= index;
            index = 0;
        }
    }
    queue.length = 0;
    index = 0;
    flushing = false;
}

// `requestFlush` is implemented using a strategy based on data collected from
// every available SauceLabs Selenium web driver worker at time of writing.
// https://docs.google.com/spreadsheets/d/1mG-5UYGup5qxGdEMWkhP6BWCz053NUb2E1QoUTU16uA/edit#gid=783724593

// Safari 6 and 6.1 for desktop, iPad, and iPhone are the only browsers that
// have WebKitMutationObserver but not un-prefixed MutationObserver.
// Must use `global` instead of `window` to work in both frames and web
// workers. `global` is a provision of Browserify, Mr, Mrs, or Mop.
var BrowserMutationObserver = global.MutationObserver || global.WebKitMutationObserver;

// MutationObservers are desirable because they have high priority and work
// reliably everywhere they are implemented.
// They are implemented in all modern browsers.
//
// - Android 4-4.3
// - Chrome 26-34
// - Firefox 14-29
// - Internet Explorer 11
// - iPad Safari 6-7.1
// - iPhone Safari 7-7.1
// - Safari 6-7
if (typeof BrowserMutationObserver === "function") {
    requestFlush = makeRequestCallFromMutationObserver(flush);

// MessageChannels are desirable because they give direct access to the HTML
// task queue, are implemented in Internet Explorer 10, Safari 5.0-1, and Opera
// 11-12, and in web workers in many engines.
// Although message channels yield to any queued rendering and IO tasks, they
// would be better than imposing the 4ms delay of timers.
// However, they do not work reliably in Internet Explorer or Safari.

// Internet Explorer 10 is the only browser that has setImmediate but does
// not have MutationObservers.
// Although setImmediate yields to the browser's renderer, it would be
// preferrable to falling back to setTimeout since it does not have
// the minimum 4ms penalty.
// Unfortunately there appears to be a bug in Internet Explorer 10 Mobile (and
// Desktop to a lesser extent) that renders both setImmediate and
// MessageChannel useless for the purposes of ASAP.
// https://github.com/kriskowal/q/issues/396

// Timers are implemented universally.
// We fall back to timers in workers in most engines, and in foreground
// contexts in the following browsers.
// However, note that even this simple case requires nuances to operate in a
// broad spectrum of browsers.
//
// - Firefox 3-13
// - Internet Explorer 6-9
// - iPad Safari 4.3
// - Lynx 2.8.7
} else {
    requestFlush = makeRequestCallFromTimer(flush);
}

// `requestFlush` requests that the high priority event queue be flushed as
// soon as possible.
// This is useful to prevent an error thrown in a task from stalling the event
// queue if the exception handled by Node.js’s
// `process.on("uncaughtException")` or by a domain.
rawAsap.requestFlush = requestFlush;

// To request a high priority event, we induce a mutation observer by toggling
// the text of a text node between "1" and "-1".
function makeRequestCallFromMutationObserver(callback) {
    var toggle = 1;
    var observer = new BrowserMutationObserver(callback);
    var node = document.createTextNode("");
    observer.observe(node, {characterData: true});
    return function requestCall() {
        toggle = -toggle;
        node.data = toggle;
    };
}

// The message channel technique was discovered by Malte Ubl and was the
// original foundation for this library.
// http://www.nonblocking.io/2011/06/windownexttick.html

// Safari 6.0.5 (at least) intermittently fails to create message ports on a
// page's first load. Thankfully, this version of Safari supports
// MutationObservers, so we don't need to fall back in that case.

// function makeRequestCallFromMessageChannel(callback) {
//     var channel = new MessageChannel();
//     channel.port1.onmessage = callback;
//     return function requestCall() {
//         channel.port2.postMessage(0);
//     };
// }

// For reasons explained above, we are also unable to use `setImmediate`
// under any circumstances.
// Even if we were, there is another bug in Internet Explorer 10.
// It is not sufficient to assign `setImmediate` to `requestFlush` because
// `setImmediate` must be called *by name* and therefore must be wrapped in a
// closure.
// Never forget.

// function makeRequestCallFromSetImmediate(callback) {
//     return function requestCall() {
//         setImmediate(callback);
//     };
// }

// Safari 6.0 has a problem where timers will get lost while the user is
// scrolling. This problem does not impact ASAP because Safari 6.0 supports
// mutation observers, so that implementation is used instead.
// However, if we ever elect to use timers in Safari, the prevalent work-around
// is to add a scroll event listener that calls for a flush.

// `setTimeout` does not call the passed callback if the delay is less than
// approximately 7 in web workers in Firefox 8 through 18, and sometimes not
// even then.

function makeRequestCallFromTimer(callback) {
    return function requestCall() {
        // We dispatch a timeout with a specified delay of 0 for engines that
        // can reliably accommodate that request. This will usually be snapped
        // to a 4 milisecond delay, but once we're flushing, there's no delay
        // between events.
        var timeoutHandle = setTimeout(handleTimer, 0);
        // However, since this timer gets frequently dropped in Firefox
        // workers, we enlist an interval handle that will try to fire
        // an event 20 times per second until it succeeds.
        var intervalHandle = setInterval(handleTimer, 50);

        function handleTimer() {
            // Whichever timer succeeds will cancel both timers and
            // execute the callback.
            clearTimeout(timeoutHandle);
            clearInterval(intervalHandle);
            callback();
        }
    };
}

// This is for `asap.js` only.
// Its name will be periodically randomized to break any code that depends on
// its existence.
rawAsap.makeRequestCallFromTimer = makeRequestCallFromTimer;

// ASAP was originally a nextTick shim included in Q. This was factored out
// into this ASAP package. It was later adapted to RSVP which made further
// amendments. These decisions, particularly to marginalize MessageChannel and
// to capture the MutationObserver implementation in a closure, were integrated
// back into ASAP proper.
// https://github.com/tildeio/rsvp.js/blob/cddf7232546a9cf858524b75cde6f9edf72620a7/lib/rsvp/asap.js

}],["mr","boot/script-params",{"url":8},function (require, exports, module){

// mr boot/script-params
// ---------------------


var URL = require("url");

module.exports = getParams;
function getParams(scriptName) {
    var i, j,
        match,
        script,
        location,
        attr,
        name,
        re = new RegExp("^(.*)" + scriptName + "(?:[\\?\\.]|$)", "i");
    var params = {};
    // Find the <script> that loads us, so we can divine our parameters
    // from its attributes.
    var scripts = document.getElementsByTagName("script");
    for (i = 0; i < scripts.length; i++) {
        script = scripts[i];
        // There are two distinct ways that a bootstrapping script might be
        // identified.  In development, we can rely on the script name.  In
        // production, the script name is produced by the optimizer and does
        // not have a generic pattern.  However, the optimizer will drop a
        // `data-boot-location` property on the script instead.  This will also
        // serve to inform the boot script of the location of the loading
        // package, albeit Montage or Mr.
        if (scriptName && script.src && (match = script.src.match(re))) {
            location = match[1];
        }
        if (script.hasAttribute("data-boot-location")) {
            location = URL.resolve(window.location, script.getAttribute("data-boot-location"));
        }
        if (location) {
            if (script.dataset) {
                for (name in script.dataset) {
                    if (script.dataset.hasOwnProperty(name)) {
                        params[name] = script.dataset[name];
                    }
                }
            } else if (script.attributes) {
                var dataRe = /^data-(.*)$/,
                    letterAfterDash = /-([a-z])/g,
                    /*jshint -W083 */
                    upperCaseChar = function (_, c) {
                        return c.toUpperCase();
                    };
                    /*jshint +W083 */

                for (j = 0; j < script.attributes.length; j++) {
                    attr = script.attributes[j];
                    match = attr.name.match(/^data-(.*)$/);
                    if (match) {
                        params[match[1].replace(letterAfterDash, upperCaseChar)] = attr.value;
                    }
                }
            }
            // Permits multiple boot <scripts>; by removing as they are
            // discovered, next one finds itself.
            script.parentNode.removeChild(script);
            params.location = location;
            break;
        }
    }
    return params;
}

}],["mr","browser",{"./common":5,"url":8,"q":14,"./script":9},function (require, exports, module){

// mr browser
// ----------

/*
 * Based in part on Motorola Mobility’s Montage
 * Copyright (c) 2012, Motorola Mobility LLC. All Rights Reserved.
 * 3-Clause BSD License
 * https://github.com/motorola-mobility/montage/blob/master/LICENSE.md
 */
/*global montageDefine:true, -URL */
/*jshint -W015, evil:true, camelcase:false */

var Require = require("./common");
var URL = require("url");
var Q = require("q");
var GET = "GET";
var APPLICATION_JAVASCRIPT_MIMETYPE = "application/javascript";
var FILE_PROTOCOL = "file:";

module.exports = Require;

Require.getLocation = function() {
    return URL.resolve(window.location, ".");
};

Require.overlays = ["window", "browser", "montage"];

// Determine if an XMLHttpRequest was successful
// Some versions of WebKit return 0 for successful file:// URLs
function xhrSuccess(req) {
    return (req.status === 200 || (req.status === 0 && req.responseText));
}

// Due to crazy variabile availability of new and old XHR APIs across
// platforms, this implementation registers every known name for the event
// listeners.  The promise library ascertains that the returned promise
// is resolved only by the first event.
// http://dl.dropbox.com/u/131998/yui/misc/get/browser-capabilities.html
Require.read = function (location) {

    if (URL.resolve(window.location, location).indexOf(FILE_PROTOCOL) === 0) {
        throw new Error("XHR does not function for file: protocol");
    }

    var request = new XMLHttpRequest();
    var response = Q.defer();

    function onload() {
        if (xhrSuccess(request)) {
            response.resolve(request.responseText);
        } else {
            onerror();
        }
    }

    function onerror() {
        response.reject(new Error("Can't XHR " + JSON.stringify(location)));
    }

    try {
        request.open(GET, location, true);
        if (request.overrideMimeType) {
            request.overrideMimeType(APPLICATION_JAVASCRIPT_MIMETYPE);
        }
        request.onreadystatechange = function () {
            if (request.readyState === 4) {
                onload();
            }
        };
        request.onload = request.load = onload;
        request.onerror = request.error = onerror;
    } catch (exception) {
        response.reject(exception);
    }

    request.send();
    return response.promise;
};

// By using a named "eval" most browsers will execute in the global scope.
// http://www.davidflanagan.com/2010/12/global-eval-in.html
// Unfortunately execScript doesn't always return the value of the evaluated expression (at least in Chrome)
var globalEval = /*this.execScript ||*/eval;
// For Firebug evaled code isn't debuggable otherwise
// http://code.google.com/p/fbug/issues/detail?id=2198
if (global.navigator && global.navigator.userAgent.indexOf("Firefox") >= 0) {
    globalEval = new Function("_", "return eval(_)");
}

var __FILE__String = "__FILE__",
    Underscore = "_",
    globalEvalConstantA = "(function ",
    globalEvalConstantB = "(require, exports, module, __filename, __dirname) {",
    globalEvalConstantC = "//*/\n})\n//@ sourceURL=";

Require.Compiler = function (config) {
    return function(module) {
        if (module.factory || module.text === void 0 || module.type !== "js") {
            return;
        }
        if (config.useScriptInjection) {
            throw new Error("Can't use eval.");
        }

        // Here we use a couple tricks to make debugging better in various browsers:
        // TODO: determine if these are all necessary / the best options
        // 1. name the function with something inteligible since some debuggers display the first part of each eval (Firebug)
        // 2. append the "//@ sourceURL=location" hack (Safari, Chrome, Firebug)
        //  * http://pmuellr.blogspot.com/2009/06/debugger-friendly.html
        //  * http://blog.getfirebug.com/2009/08/11/give-your-eval-a-name-with-sourceurl/
        //      TODO: investigate why this isn't working in Firebug.
        // 3. set displayName property on the factory function (Safari, Chrome)

        var displayName = (module.require.config.name + Underscore + module.id).replace(/[^\w\d]|^\d/g, Underscore);

        try {
            module.factory = globalEval(globalEvalConstantA+displayName+globalEvalConstantB+module.text+globalEvalConstantC+module.location);
            if (!config.saveText) {
                delete module.text; // save some space
            }
        } catch (exception) {
            exception.message = exception.message + " in " + module.location;
            throw exception;
        }

        // This should work and would be simpler, but Firebug does not show scripts executed via "new Function()" constructor.
        // TODO: sniff browser?
        // module.factory = new Function("require", "exports", "module", module.text + "\n//*/"+sourceURLComment);

        module.factory.displayName = displayName;
    };
};

Require.XhrLoader = function (config) {
    return function (location, module) {
        return config.read(location)
        .then(function (text) {
            module.text = text;
            module.location = location;
        });
    };
};

var definitions = {};
var getDefinition = function (hash, id) {
    definitions[hash] = definitions[hash] || {};
    definitions[hash][id] = definitions[hash][id] || Q.defer();
    return definitions[hash][id];
};

// global
montageDefine = function (hash, id, module) {
    getDefinition(hash, id).resolve(module);
};

Require.loadScript = require("./script");

Require.ScriptLoader = function (config) {
    var hash = config.packageDescription.hash;
    return function (location, module) {
        return Q.try(function () {

            // short-cut by predefinition
            if (definitions[hash] && definitions[hash][module.id]) {
                return definitions[hash][module.id].promise;
            }

            if (/\.js$/.test(location)) {
                location = location.replace(/\.js/, ".load.js");
            } else {
                location += ".load.js";
            }

            Require.loadScript(location);

            var definition = getDefinition(hash, module.id).promise;
            loadIfNotPreloaded(location, definition, config.preloaded);
            return definition;
        })
        .then(function (definition) {
            /*jshint -W089 */
            delete definitions[hash][module.id];
            for (var name in definition) {
                module[name] = definition[name];
            }
            module.location = location;
            module.directory = URL.resolve(location, ".");
            /*jshint +W089 */
        });
    };
};

// old version
var loadPackageDescription = Require.loadPackageDescription;
Require.loadPackageDescription = function (dependency, config) {
    if (dependency.hash) { // use script injection
        var definition = getDefinition(dependency.hash, "package.json").promise;
        var location = URL.resolve(dependency.location, "package.json.load.js");
        loadIfNotPreloaded(location, definition, config.preloaded);
        return definition.get("exports");
    } else {
        // fall back to normal means
        return loadPackageDescription(dependency, config);
    }
};

Require.makeLoader = function (config) {
    var Loader;
    if (config.useScriptInjection) {
        Loader = Require.ScriptLoader;
    } else {
        Loader = Require.XhrLoader;
    }
    return Require.CommonLoader(config, Loader(config));
};

function loadIfNotPreloaded(location, definition, preloaded) {
    // The package.json might come in a preloading bundle. If so, we do not
    // want to issue a script injection. However, if by the time preloading
    // has finished the package.json has not arrived, we will need to kick off
    // a request for the requested script.
    if (preloaded && preloaded.isPending()) {
        preloaded
        .then(function () {
            if (definition.isPending()) {
                Require.loadScript(location);
            }
        })
        .done();
    } else if (definition.isPending()) {
        // otherwise preloading has already completed and we don't have the
        // module, so load it
        Require.loadScript(location);
    }
}

}],["mr","common",{"q":14,"url":8,"./merge":7,"./identifier":6},function (require, exports, module){

// mr common
// ---------

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
var merge = require("./merge");
var Identifier = require("./identifier");

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
        if (!has.call(modules, lookupId)) {
            var extension = Identifier.extension(id);
            var type;
            if (
                extension && (
                    has.call(config.optimizers, extension) ||
                    has.call(config.translators, extension) ||
                    has.call(config.compilers, extension)
                )
            ) {
                type = extension;
            } else {
                type = "js";
            }
            var module = {
                id: id,
                extension: extension,
                type: type,
                display: (config.name || config.location) + "#" + id,
                require: makeRequire(id)
            };
            modules[lookupId] = module;
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
                return config.load(topId, module);
            }
        })
        .then(function () {
            // Translate (to JavaScript, optionally provide dependency analysis
            // services).
            if (module.type !== "js" && has.call(config.translators, module.type)) {
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
                    module.type = "js";
                    return translate(module);
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
            if (config.hasPreprocessorPackage && has.call(config.optimizers, module.type)) {
                var optimizerId = config.optimizers[module.type];
                return config.loadPreprocessorPackage()
                .invoke("async", optimizerId)
                .then(function (optimize) {
                    return optimize(module);
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
                if (has.call(config.compilers, module.type)) {
                    var compilerId = Identifier.resolve(config.compilers[module.type], "");
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
        // has this all happened before?  will it happen again?
        loading = loading || {};
        if (has.call(loading, topId)) {
            return Q(); // break the cycle of violence.
        }
        loading[topId] = true; // this has happened before
        return load(topId, viaId)
        .then(function () {
            // load the transitive dependencies using the magic of
            // recursion.
            var dependencies = module.dependencies = module.dependencies || [];
            return Q.all(module.dependencies.map(function (depId) {
                depId = Identifier.resolve(depId, topId);
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
        topId = Identifier.resolve(topId, viaId);
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
                " via " + JSON.stringify(viaId) + " " + JSON.stringify(module) +
                " because no factory was or exports were created by the module loader configuration"
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
        if (has.call(seen, location)) {
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
            var topId = Identifier.resolve(id, viaId);
            return getExports(topId, viaId);
        };

        // Asynchronous "require.async()" which ensures async executation
        // (even with synchronous loaders)
        require.async = function (id) {
            var topId = Identifier.resolve(id, viaId);
            var module = getModuleDescriptor(id);
            return deepLoad(topId, viaId, {})
            .then(function () {
                return require(topId);
            });
        };

        require.lookup = function (id) {
            return lookup(id, viaId);
        };

        require.resolve = function (id) {
            return Identifier.normalize(Identifier.resolve(id, viaId));
        };

        require.load = function (id) {
            return load(id, viaId);
        };

        require.deepLoad = function (id) {
            return deepLoad(id, viaId, {});
        };

        require.getModule = getModuleDescriptor; // XXX deprecated, use:
        require.getModuleDescriptor = getModuleDescriptor;

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
            redirect: Identifier.normalize(Identifier.resolve(description.main, "")),
            location: config.location
        };

    }

    // Deal with redirects
    var redirects = description.redirects;
    if (redirects !== void 0) {
        Object.keys(redirects).forEach(function (source) {
            var target = redirects[source];
            source = Identifier.normalize(Identifier.resolve(source, ""));
            target = Identifier.normalize(Identifier.resolve(target, ""));
            modules[source] = {
                id: source,
                redirect: target,
                location: URL.resolve(location, target)
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
            if (has.call(describedPatterns, pattern)) {
                redirectTable.push([
                    new RegExp(pattern),
                    describedPatterns[pattern]
                ]);
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
            !has.call(config.optimizers, extension) &&
            !has.call(config.translators, extension) &&
            !has.call(config.compilers, extension) &&
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

Require.resolve = Identifier.resolve;
Require.normalize = Identifier.normalize;
Require.extension = Identifier.extension;

// Tests whether the URL is a absolute.
Require.isAbsolute = isAbsolute;
function isAbsolute(location) {
    return (/^[\w\-]+:/).test(location);
}

// Extracts dependencies by parsing code and looking for "require" (currently
// using a regexp)
Require.parseDependencies = parseDependencies;
function parseDependencies(text) {
    var dependsUpon = {};
    String(text).replace(/(?:^|[^\w\$_.])require\s*\(\s*["']([^"']*)["']\s*\)/g, function(_, id) {
        dependsUpon[id] = true;
    });
    return Object.keys(dependsUpon);
}

var has = Object.prototype.hasOwnProperty;

function memoize(callback, cache) {
    cache = cache || {};
    return function (key, arg) {
        if (!has.call(cache, key)) {
            cache[key] = Q(callback).call(void 0, key, arg);
        }
        return cache[key];
    };
}

}],["mr","identifier",{},function (require, exports, module){

// mr identifier
// -------------


// Resolves CommonJS module IDs (not paths)
exports.resolve = resolve;
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

exports.normalize = normalize;
function normalize(id) {
    var match = /^(.*)\.js$/.exec(id);
    if (match) {
        id = match[1];
    }
    return id;
}

exports.extension = extension;
function extension(location) {
    var match = /\.([^\/\.]+)$/.exec(location);
    if (match) {
        return match[1];
    }
}

}],["mr","merge",{},function (require, exports, module){

// mr merge
// --------


module.exports = merge;
function merge(target, source) {
    for (var name in source) {
        if (has.call(source, name)) {
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

var has = Object.prototype.hasOwnProperty;

}],["mr","mini-url",{},function (require, exports, module){

// mr mini-url
// -----------


// This is the browser implementation for "mr/url",
// redirected from "url" within the Mr package by the Montage Require
// loader because of the "browser" redirects in package.json.

// This is a very small subset of the Node.js URL module, suitable only for
// resolving relative module identifiers relative to fully qualified base
// URL’s.
// Because Montage Require only needs this part of the URL module, a
// very compact implementation is possible, teasing the necessary behavior out
// of the browser's own URL resolution mechanism, even though at time of
// writing, browsers do not provide an explicit JavaScript interface.

// The implementation takes advantage of the "href" getter/setter on an "a"
// (anchor) tag in the presence of a "base" tag on the document.
// We either use an existing "base" tag or temporarily introduce a fake
// "base" tag into the header of the page.
// We then temporarily modify the "href" of the base tag to be the base URL
// for the duration of a call to URL.resolve, to be the base URL argument.
// We then apply the relative URL to the "href" setter of an anchor tag,
// and read back the absolute URL from the "href" getter.
// The browser guarantees that the "href" property will report the fully
// qualified URL relative to the page's location, albeit its "base" location.

var head = document.querySelector("head"),
    baseElement = document.createElement("base"),
    relativeElement = document.createElement("a");

baseElement.href = "";

exports.resolve = function resolve(base, relative) {
    var currentBaseElement = head.querySelector("base");
    if (!currentBaseElement) {
        head.appendChild(baseElement);
        currentBaseElement = baseElement;
    }
    base = String(base);
    if (!/^[\w\-]+:/.test(base)) { // isAbsolute(base)
        throw new Error("Can't resolve from a relative location: " + JSON.stringify(base) + " " + JSON.stringify(relative));
    }
    var restore = currentBaseElement.href;
    currentBaseElement.href = base;
    relativeElement.href = relative;
    var resolved = relativeElement.href;
    currentBaseElement.href = restore;
    if (currentBaseElement === baseElement) {
        head.removeChild(currentBaseElement);
    }
    return resolved;
};

}],["mr","script",{},function (require, exports, module){

// mr script
// ---------


module.exports = load;

var head = document.querySelector("head");
function load(location) {
    var script = document.createElement("script");
    script.src = location;
    script.onload = function () {
        script.parentNode.removeChild(script);
    };
    script.onerror = function (error) {
        script.parentNode.removeChild(script);
    };
    script.defer = true;
    head.appendChild(script);
}

}],["pop-iterate","array-iterator",{"./iteration":11},function (require, exports, module){

// pop-iterate array-iterator
// --------------------------

"use strict";

var Iteration = require("./iteration");

module.exports = ArrayIterator;
function ArrayIterator(iterable, start, stop, step) {
    this.array = iterable;
    this.start = start || 0;
    this.stop = stop || Infinity;
    this.step = step || 1;
}

ArrayIterator.prototype.next = function () {
    var iteration;
    if (this.start < Math.min(this.array.length, this.stop)) {
        iteration = new Iteration(this.array[this.start], false, this.start);
        this.start += this.step;
    } else {
        iteration =  new Iteration(undefined, true);
    }
    return iteration;
};

}],["pop-iterate","iteration",{},function (require, exports, module){

// pop-iterate iteration
// ---------------------

"use strict";

module.exports = Iteration;
function Iteration(value, done, index) {
    this.value = value;
    this.done = done;
    this.index = index;
}

Iteration.prototype.equals = function (other) {
    return (
        typeof other == 'object' &&
        other.value === this.value &&
        other.done === this.done &&
        other.index === this.index
    );
};

}],["pop-iterate","object-iterator",{"./iteration":11,"./array-iterator":10},function (require, exports, module){

// pop-iterate object-iterator
// ---------------------------

"use strict";

var Iteration = require("./iteration");
var ArrayIterator = require("./array-iterator");

module.exports = ObjectIterator;
function ObjectIterator(iterable, start, stop, step) {
    this.object = iterable;
    this.keysIterator = new ArrayIterator(Object.keys(iterable), start, stop, step);
}

ObjectIterator.prototype.next = function () {
    var iteration = this.keysIterator.next();
    if (iteration.done) {
        return iteration;
    }
    var key = iteration.value;
    return new Iteration(this.object[key], false, key);
};

}],["pop-iterate","pop-iterate",{"./array-iterator":10,"./object-iterator":12},function (require, exports, module){

// pop-iterate pop-iterate
// -----------------------

"use strict";

var ArrayIterator = require("./array-iterator");
var ObjectIterator = require("./object-iterator");

module.exports = iterate;
function iterate(iterable, start, stop, step) {
    if (!iterable) {
        return empty;
    } else if (Array.isArray(iterable)) {
        return new ArrayIterator(iterable, start, stop, step);
    } else if (typeof iterable.next === "function") {
        return iterable;
    } else if (typeof iterable.iterate === "function") {
        return iterable.iterate(start, stop, step);
    } else if (typeof iterable === "object") {
        return new ObjectIterator(iterable);
    } else {
        throw new TypeError("Can't iterate " + iterable);
    }
}

}],["q","q",{"weak-map":15,"pop-iterate":13,"asap":1},function (require, exports, module){

// q q
// ---

/* vim:ts=4:sts=4:sw=4: */
/*!
 *
 * Copyright 2009-2013 Kris Kowal under the terms of the MIT
 * license found at http://github.com/kriskowal/q/raw/master/LICENSE
 *
 * With parts by Tyler Close
 * Copyright 2007-2009 Tyler Close under the terms of the MIT X license found
 * at http://www.opensource.org/licenses/mit-license.html
 * Forked at ref_send.js version: 2009-05-11
 *
 * With parts by Mark Miller
 * Copyright (C) 2011 Google Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 */
/*global -WeakMap */
"use strict";

var hasStacks = false;
try {
    throw new Error();
} catch (e) {
    hasStacks = !!e.stack;
}

// All code after this point will be filtered from stack traces reported
// by Q.
var qStartingLine = captureLine();
var qFileName;

var WeakMap = require("weak-map");
var iterate = require("pop-iterate");
var asap = require("asap");

function isObject(value) {
    return value === Object(value);
}

// long stack traces

var STACK_JUMP_SEPARATOR = "From previous event:";

function makeStackTraceLong(error, promise) {
    // If possible, transform the error stack trace by removing Node and Q
    // cruft, then concatenating with the stack trace of `promise`. See #57.
    if (hasStacks &&
        promise.stack &&
        typeof error === "object" &&
        error !== null &&
        error.stack &&
        error.stack.indexOf(STACK_JUMP_SEPARATOR) === -1
    ) {
        var stacks = [];
        for (var p = promise; !!p && handlers.get(p); p = handlers.get(p).became) {
            if (p.stack) {
                stacks.unshift(p.stack);
            }
        }
        stacks.unshift(error.stack);

        var concatedStacks = stacks.join("\n" + STACK_JUMP_SEPARATOR + "\n");
        error.stack = filterStackString(concatedStacks);
    }
}

function filterStackString(stackString) {
    if (Q.isIntrospective) {
        return stackString;
    }
    var lines = stackString.split("\n");
    var desiredLines = [];
    for (var i = 0; i < lines.length; ++i) {
        var line = lines[i];

        if (!isInternalFrame(line) && !isNodeFrame(line) && line) {
            desiredLines.push(line);
        }
    }
    return desiredLines.join("\n");
}

function isNodeFrame(stackLine) {
    return stackLine.indexOf("(module.js:") !== -1 ||
           stackLine.indexOf("(node.js:") !== -1;
}

function getFileNameAndLineNumber(stackLine) {
    // Named functions: "at functionName (filename:lineNumber:columnNumber)"
    // In IE10 function name can have spaces ("Anonymous function") O_o
    var attempt1 = /at .+ \((.+):(\d+):(?:\d+)\)$/.exec(stackLine);
    if (attempt1) {
        return [attempt1[1], Number(attempt1[2])];
    }

    // Anonymous functions: "at filename:lineNumber:columnNumber"
    var attempt2 = /at ([^ ]+):(\d+):(?:\d+)$/.exec(stackLine);
    if (attempt2) {
        return [attempt2[1], Number(attempt2[2])];
    }

    // Firefox style: "function@filename:lineNumber or @filename:lineNumber"
    var attempt3 = /.*@(.+):(\d+)$/.exec(stackLine);
    if (attempt3) {
        return [attempt3[1], Number(attempt3[2])];
    }
}

function isInternalFrame(stackLine) {
    var fileNameAndLineNumber = getFileNameAndLineNumber(stackLine);

    if (!fileNameAndLineNumber) {
        return false;
    }

    var fileName = fileNameAndLineNumber[0];
    var lineNumber = fileNameAndLineNumber[1];

    return fileName === qFileName &&
        lineNumber >= qStartingLine &&
        lineNumber <= qEndingLine;
}

// discover own file name and line number range for filtering stack
// traces
function captureLine() {
    if (!hasStacks) {
        return;
    }

    try {
        throw new Error();
    } catch (e) {
        var lines = e.stack.split("\n");
        var firstLine = lines[0].indexOf("@") > 0 ? lines[1] : lines[2];
        var fileNameAndLineNumber = getFileNameAndLineNumber(firstLine);
        if (!fileNameAndLineNumber) {
            return;
        }

        qFileName = fileNameAndLineNumber[0];
        return fileNameAndLineNumber[1];
    }
}

function deprecate(callback, name, alternative) {
    return function Q_deprecate() {
        if (
            typeof console !== "undefined" &&
            typeof console.warn === "function"
        ) {
            if (alternative) {
                console.warn(
                    name + " is deprecated, use " + alternative + " instead.",
                    new Error("").stack
                );
            } else {
                console.warn(
                    name + " is deprecated.",
                    new Error("").stack
                );
            }
        }
        return callback.apply(this, arguments);
    };
}

// end of long stack traces

var handlers = new WeakMap();

function Q_getHandler(promise) {
    var handler = handlers.get(promise);
    if (!handler || !handler.became) {
        return handler;
    }
    handler = follow(handler);
    handlers.set(promise, handler);
    return handler;
}

function follow(handler) {
    if (!handler.became) {
        return handler;
    } else {
        handler.became = follow(handler.became);
        return handler.became;
    }
}

var theViciousCycleError = new Error("Can't resolve a promise with itself");
var theViciousCycleRejection = Q_reject(theViciousCycleError);
var theViciousCycle = Q_getHandler(theViciousCycleRejection);

var thenables = new WeakMap();

/**
 * Coerces a value to a promise. If the value is a promise, pass it through
 * unaltered. If the value has a `then` method, it is presumed to be a promise
 * but not one of our own, so it is treated as a “thenable” promise and this
 * returns a promise that stands for it. Otherwise, this returns a promise that
 * has already been fulfilled with the value.
 * @param value promise, object with a then method, or a fulfillment value
 * @returns {Promise} the same promise as given, or a promise for the given
 * value
 */
module.exports = Q;
function Q(value) {
    // If the object is already a Promise, return it directly.  This enables
    // the resolve function to both be used to created references from objects,
    // but to tolerably coerce non-promises to promises.
    if (Q_isPromise(value)) {
        return value;
    } else if (isThenable(value)) {
        if (!thenables.has(value)) {
            thenables.set(value, new Promise(new Thenable(value)));
        }
        return thenables.get(value);
    } else {
        return new Promise(new Fulfilled(value));
    }
}

/**
 * Controls whether or not long stack traces will be on
 * @type {boolean}
 */
Q.longStackSupport = false;

/**
 * Returns a promise that has been rejected with a reason, which should be an
 * instance of `Error`.
 * @param {Error} error reason for the failure.
 * @returns {Promise} rejection
 */
Q.reject = Q_reject;
function Q_reject(error) {
    return new Promise(new Rejected(error));
}

/**
 * Constructs a {promise, resolve, reject} object.
 *
 * `resolve` is a callback to invoke with a more resolved value for the
 * promise. To fulfill the promise, invoke `resolve` with any value that is
 * not a thenable. To reject the promise, invoke `resolve` with a rejected
 * thenable, or invoke `reject` with the reason directly. To resolve the
 * promise to another thenable, thus putting it in the same state, invoke
 * `resolve` with that other thenable.
 *
 * @returns {{promise, resolve, reject}} a deferred
 */
Q.defer = defer;
function defer() {

    var handler = new Pending();
    var promise = new Promise(handler);
    var deferred = new Deferred(promise);

    if (Q.longStackSupport && hasStacks) {
        try {
            throw new Error();
        } catch (e) {
            // NOTE: don't try to use `Error.captureStackTrace` or transfer the
            // accessor around; that causes memory leaks as per GH-111. Just
            // reify the stack trace as a string ASAP.
            //
            // At the same time, cut off the first line; it's always just
            // "[object Promise]\n", as per the `toString`.
            promise.stack = e.stack.substring(e.stack.indexOf("\n") + 1);
        }
    }

    return deferred;
}

// TODO
/**
 */
Q.when = function Q_when(value, fulfilled, rejected, ms) {
    return Q(value).then(fulfilled, rejected, ms);
};

/**
 * Turns an array of promises into a promise for an array.  If any of the
 * promises gets rejected, the whole array is rejected immediately.
 * @param {Array.<Promise>} an array (or promise for an array) of values (or
 * promises for values)
 * @returns {Promise.<Array>} a promise for an array of the corresponding values
 */
// By Mark Miller
// http://wiki.ecmascript.org/doku.php?id=strawman:concurrency&rev=1308776521#allfulfilled
Q.all = Q_all;
function Q_all(questions) {
    // XXX deprecated behavior
    if (Q_isPromise(questions)) {
        if (
            typeof console !== "undefined" &&
            typeof console.warn === "function"
        ) {
            console.warn("Q.all no longer directly unwraps a promise. Use Q(array).all()");
        }
        return Q(questions).all();
    }
    var countDown = 0;
    var deferred = defer();
    var answers = Array(questions.length);
    var estimates = [];
    var estimate = -Infinity;
    var setEstimate;
    Array.prototype.forEach.call(questions, function Q_all_each(promise, index) {
        var handler;
        if (
            Q_isPromise(promise) &&
            (handler = Q_getHandler(promise)).state === "fulfilled"
        ) {
            answers[index] = handler.value;
        } else {
            ++countDown;
            promise = Q(promise);
            promise.then(
                function Q_all_eachFulfilled(value) {
                    answers[index] = value;
                    if (--countDown === 0) {
                        deferred.resolve(answers);
                    }
                },
                deferred.reject
            );

            promise.observeEstimate(function Q_all_eachEstimate(newEstimate) {
                var oldEstimate = estimates[index];
                estimates[index] = newEstimate;
                if (newEstimate > estimate) {
                    estimate = newEstimate;
                } else if (oldEstimate === estimate && newEstimate <= estimate) {
                    // There is a 1/length chance that we will need to perform
                    // this O(length) walk, so amortized O(1)
                    computeEstimate();
                }
                if (estimates.length === questions.length && estimate !== setEstimate) {
                    deferred.setEstimate(estimate);
                    setEstimate = estimate;
                }
            });

        }
    });

    function computeEstimate() {
        estimate = -Infinity;
        for (var index = 0; index < estimates.length; index++) {
            if (estimates[index] > estimate) {
                estimate = estimates[index];
            }
        }
    }

    if (countDown === 0) {
        deferred.resolve(answers);
    }

    return deferred.promise;
}

/**
 * @see Promise#allSettled
 */
Q.allSettled = Q_allSettled;
function Q_allSettled(questions) {
    // XXX deprecated behavior
    if (Q_isPromise(questions)) {
        if (
            typeof console !== "undefined" &&
            typeof console.warn === "function"
        ) {
            console.warn("Q.allSettled no longer directly unwraps a promise. Use Q(array).allSettled()");
        }
        return Q(questions).allSettled();
    }
    return Q_all(questions.map(function Q_allSettled_each(promise) {
        promise = Q(promise);
        function regardless() {
            return promise.inspect();
        }
        return promise.then(regardless, regardless);
    }));
}

/**
 * Returns a promise for the given value (or promised value), some
 * milliseconds after it resolved. Passes rejections immediately.
 * @param {Any*} promise
 * @param {Number} milliseconds
 * @returns a promise for the resolution of the given promise after milliseconds
 * time has elapsed since the resolution of the given promise.
 * If the given promise rejects, that is passed immediately.
 */
Q.delay = function Q_delay(object, timeout) {
    if (timeout === void 0) {
        timeout = object;
        object = void 0;
    }
    return Q(object).delay(timeout);
};

/**
 * Causes a promise to be rejected if it does not get fulfilled before
 * some milliseconds time out.
 * @param {Any*} promise
 * @param {Number} milliseconds timeout
 * @param {String} custom error message (optional)
 * @returns a promise for the resolution of the given promise if it is
 * fulfilled before the timeout, otherwise rejected.
 */
Q.timeout = function Q_timeout(object, ms, message) {
    return Q(object).timeout(ms, message);
};

/**
 * Spreads the values of a promised array of arguments into the
 * fulfillment callback.
 * @param fulfilled callback that receives variadic arguments from the
 * promised array
 * @param rejected callback that receives the exception if the promise
 * is rejected.
 * @returns a promise for the return value or thrown exception of
 * either callback.
 */
Q.spread = Q_spread;
function Q_spread(value, fulfilled, rejected) {
    return Q(value).spread(fulfilled, rejected);
}

/**
 * If two promises eventually fulfill to the same value, promises that value,
 * but otherwise rejects.
 * @param x {Any*}
 * @param y {Any*}
 * @returns {Any*} a promise for x and y if they are the same, but a rejection
 * otherwise.
 *
 */
Q.join = function Q_join(x, y) {
    return Q.spread([x, y], function Q_joined(x, y) {
        if (x === y) {
            // TODO: "===" should be Object.is or equiv
            return x;
        } else {
            throw new Error("Can't join: not the same: " + x + " " + y);
        }
    });
};

/**
 * Returns a promise for the first of an array of promises to become fulfilled.
 * @param answers {Array} promises to race
 * @returns {Promise} the first promise to be fulfilled
 */
Q.race = Q_race;
function Q_race(answerPs) {
    return new Promise(function(deferred) {
        answerPs.forEach(function(answerP) {
            Q(answerP).then(deferred.resolve, deferred.reject);
        });
    });
}

/**
 * Calls the promised function in a future turn.
 * @param object    promise or immediate reference for target function
 * @param ...args   array of application arguments
 */
Q.try = function Q_try(callback) {
    return Q(callback).dispatch("call", [[]]);
};

/**
 * TODO
 */
Q.function = Promise_function;
function Promise_function(wrapped) {
    return function promiseFunctionWrapper() {
        var args = new Array(arguments.length);
        for (var index = 0; index < arguments.length; index++) {
            args[index] = arguments[index];
        }
        return Q(wrapped).apply(this, args);
    };
}

/**
 * The promised function decorator ensures that any promise arguments
 * are settled and passed as values (`this` is also settled and passed
 * as a value).  It will also ensure that the result of a function is
 * always a promise.
 *
 * @example
 * var add = Q.promised(function (a, b) {
 *     return a + b;
 * });
 * add(Q(a), Q(B));
 *
 * @param {function} callback The function to decorate
 * @returns {function} a function that has been decorated.
 */
Q.promised = function Q_promised(callback) {
    return function promisedMethod() {
        var args = new Array(arguments.length);
        for (var index = 0; index < arguments.length; index++) {
            args[index] = arguments[index];
        }
        return Q_spread(
            [this, Q_all(args)],
            function Q_promised_spread(self, args) {
                return callback.apply(self, args);
            }
        );
    };
};

/**
 */
Q.passByCopy = // TODO XXX experimental
Q.push = function (value) {
    if (Object(value) === value && !Q_isPromise(value)) {
        passByCopies.set(value, true);
    }
    return value;
};

Q.isPortable = function (value) {
    return Object(value) === value && passByCopies.has(value);
};

var passByCopies = new WeakMap();

/**
 * The async function is a decorator for generator functions, turning
 * them into asynchronous generators. Although generators are only
 * part of the newest ECMAScript 6 drafts, this code does not cause
 * syntax errors in older engines. This code should continue to work
 * and will in fact improve over time as the language improves.
 *
 * ES6 generators are currently part of V8 version 3.19 with the
 * `--harmony-generators` runtime flag enabled. This function does not
 * support the former, Pythonic generators that were only implemented
 * by SpiderMonkey.
 *
 * Decorates a generator function such that:
 *  - it may yield promises
 *  - execution will continue when that promise is fulfilled
 *  - the value of the yield expression will be the fulfilled value
 *  - it returns a promise for the return value (when the generator
 *    stops iterating)
 *  - the decorated function returns a promise for the return value
 *    of the generator or the first rejected promise among those
 *    yielded.
 *  - if an error is thrown in the generator, it propagates through
 *    every following yield until it is caught, or until it escapes
 *    the generator function altogether, and is translated into a
 *    rejection for the promise returned by the decorated generator.
 */
Q.async = Q_async;
function Q_async(makeGenerator) {
    return function spawn() {
        // when verb is "send", arg is a value
        // when verb is "throw", arg is an exception
        function continuer(verb, arg) {
            var iteration;
            try {
                iteration = generator[verb](arg);
            } catch (exception) {
                return Q_reject(exception);
            }
            if (iteration.done) {
                return Q(iteration.value);
            } else {
                return Q(iteration.value).then(callback, errback);
            }
        }
        var generator = makeGenerator.apply(this, arguments);
        var callback = continuer.bind(continuer, "next");
        var errback = continuer.bind(continuer, "throw");
        return callback();
    };
}

/**
 * The spawn function is a small wrapper around async that immediately
 * calls the generator and also ends the promise chain, so that any
 * unhandled errors are thrown instead of forwarded to the error
 * handler. This is useful because it's extremely common to run
 * generators at the top-level to work with libraries.
 */
Q.spawn = Q_spawn;
function Q_spawn(makeGenerator) {
    Q_async(makeGenerator)().done();
}


// Thus begins the section dedicated to the Promise

/**
 * TODO
 */
Q.Promise = Promise;
function Promise(handler) {
    if (!(this instanceof Promise)) {
        return new Promise(handler);
    }
    if (typeof handler === "function") {
        var setup = handler;
        var deferred = defer();
        handler = Q_getHandler(deferred.promise);
        try {
            setup(deferred.resolve, deferred.reject, deferred.setEstimate);
        } catch (error) {
            deferred.reject(error);
        }
    }
    handlers.set(this, handler);
}

/**
 * Turns an array of promises into a promise for an array.  If any of the
 * promises gets rejected, the whole array is rejected immediately.
 * @param {Array.<Promise>} an array (or promise for an array) of values (or
 * promises for values)
 * @returns {Promise.<Array>} a promise for an array of the corresponding values
 */
Promise.all = Q_all;

/**
 * Returns a promise for the first of an array of promises to become fulfilled.
 * @param answers {Array} promises to race
 * @returns {Promise} the first promise to be fulfilled
 */
Promise.race = Q_race;

/**
 * Coerces a value to a promise. If the value is a promise, pass it through
 * unaltered. If the value has a `then` method, it is presumed to be a promise
 * but not one of our own, so it is treated as a “thenable” promise and this
 * returns a promise that stands for it. Otherwise, this returns a promise that
 * has already been fulfilled with the value.
 * @param value promise, object with a then method, or a fulfillment value
 * @returns {Promise} the same promise as given, or a promise for the given
 * value
 */
Promise.resolve = Promise_resolve;
function Promise_resolve(value) {
    return Q(value);
}

/**
 * Returns a promise that has been rejected with a reason, which should be an
 * instance of `Error`.
 * @param reason value describing the failure
 * @returns {Promise} rejection
 */
Promise.reject = Q_reject;

/**
 * @returns {boolean} whether the given value is a promise.
 */
Q.isPromise = Q_isPromise;
function Q_isPromise(object) {
    return isObject(object) && !!handlers.get(object);
}

/**
 * @returns {boolean} whether the given value is an object with a then method.
 * @private
 */
function isThenable(object) {
    return isObject(object) && typeof object.then === "function";
}

/**
 * Synchronously produces a snapshot of the internal state of the promise.  The
 * object will have a `state` property. If the `state` is `"pending"`, there
 * will be no further information. If the `state` is `"fulfilled"`, there will
 * be a `value` property. If the state is `"rejected"` there will be a `reason`
 * property.  If the promise was constructed from a “thenable” and `then` nor
 * any other method has been dispatched on the promise has been called, the
 * state will be `"pending"`. The state object will not be updated if the
 * state changes and changing it will have no effect on the promise. Every
 * call to `inspect` produces a unique object.
 * @returns {{state: string, value?, reason?}}
 */
Promise.prototype.inspect = function Promise_inspect() {
    // the second layer captures only the relevant "state" properties of the
    // handler to prevent leaking the capability to access or alter the
    // handler.
    return Q_getHandler(this).inspect();
};

/**
 * @returns {boolean} whether the promise is waiting for a result.
 */
Promise.prototype.isPending = function Promise_isPending() {
    return Q_getHandler(this).state === "pending";
};

/**
 * @returns {boolean} whether the promise has ended in a result and has a
 * fulfillment value.
 */
Promise.prototype.isFulfilled = function Promise_isFulfilled() {
    return Q_getHandler(this).state === "fulfilled";
};

/**
 * @returns {boolean} whether the promise has ended poorly and has a reason for
 * its rejection.
 */
Promise.prototype.isRejected = function Promise_isRejected() {
    return Q_getHandler(this).state === "rejected";
};

/**
 * TODO
 */
Promise.prototype.toBePassed = function Promise_toBePassed() {
    return Q_getHandler(this).state === "passed";
};

/**
 * @returns {string} merely `"[object Promise]"`
 */
Promise.prototype.toString = function Promise_toString() {
    return "[object Promise]";
};

/**
 * Creates a new promise, waits for this promise to be resolved, and informs
 * either the fullfilled or rejected handler of the result. Whatever result
 * comes of the fulfilled or rejected handler, a value returned, a promise
 * returned, or an error thrown, becomes the resolution for the promise
 * returned by `then`.
 *
 * @param fulfilled
 * @param rejected
 * @returns {Promise} for the result of `fulfilled` or `rejected`.
 */
Promise.prototype.then = function Promise_then(fulfilled, rejected, ms) {
    var self = this;
    var deferred = defer();

    var _fulfilled;
    if (typeof fulfilled === "function") {
        _fulfilled = function Promise_then_fulfilled(value) {
            try {
                deferred.resolve(fulfilled.call(void 0, value));
            } catch (error) {
                deferred.reject(error);
            }
        };
    } else {
        _fulfilled = deferred.resolve;
    }

    var _rejected;
    if (typeof rejected === "function") {
        _rejected = function Promise_then_rejected(error) {
            try {
                deferred.resolve(rejected.call(void 0, error));
            } catch (newError) {
                deferred.reject(newError);
            }
        };
    } else {
        _rejected = deferred.reject;
    }

    this.done(_fulfilled, _rejected);

    if (ms !== void 0) {
        var updateEstimate = function Promise_then_updateEstimate() {
            deferred.setEstimate(self.getEstimate() + ms);
        };
        this.observeEstimate(updateEstimate);
        updateEstimate();
    }

    return deferred.promise;
};

/**
 * Terminates a chain of promises, forcing rejections to be
 * thrown as exceptions.
 * @param fulfilled
 * @param rejected
 */
Promise.prototype.done = function Promise_done(fulfilled, rejected) {
    var self = this;
    var done = false;   // ensure the untrusted promise makes at most a
                        // single call to one of the callbacks
    asap(function Promise_done_task() {
        var _fulfilled;
        if (typeof fulfilled === "function") {
            if (Q.onerror) {
                _fulfilled = function Promise_done_fulfilled(value) {
                    if (done) {
                        return;
                    }
                    done = true;
                    try {
                        fulfilled.call(void 0, value);
                    } catch (error) {
                        // fallback to rethrow is still necessary because
                        // _fulfilled is not called in the same event as the
                        // above guard.
                        (Q.onerror || Promise_rethrow)(error);
                    }
                };
            } else {
                _fulfilled = function Promise_done_fulfilled(value) {
                    if (done) {
                        return;
                    }
                    done = true;
                    fulfilled.call(void 0, value);
                };
            }
        }

        var _rejected;
        if (typeof rejected === "function" && Q.onerror) {
            _rejected = function Promise_done_rejected(error) {
                if (done) {
                    return;
                }
                done = true;
                makeStackTraceLong(error, self);
                try {
                    rejected.call(void 0, error);
                } catch (newError) {
                    (Q.onerror || Promise_rethrow)(newError);
                }
            };
        } else if (typeof rejected === "function") {
            _rejected = function Promise_done_rejected(error) {
                if (done) {
                    return;
                }
                done = true;
                makeStackTraceLong(error, self);
                rejected.call(void 0, error);
            };
        } else {
            _rejected = Q.onerror || Promise_rethrow;
        }

        if (typeof process === "object" && process.domain) {
            _rejected = process.domain.bind(_rejected);
        }

        Q_getHandler(self).dispatch(_fulfilled, "then", [_rejected]);
    });
};

function Promise_rethrow(error) {
    throw error;
}

/**
 * TODO
 */
Promise.prototype.thenResolve = function Promise_thenResolve(value) {
    // Wrapping ahead of time to forestall multiple wrappers.
    value = Q(value);
    // Using all is necessary to aggregate the estimated time to completion.
    return Q_all([this, value]).then(function Promise_thenResolve_resolved() {
        return value;
    }, null, 0);
    // 0: does not contribute significantly to the estimated time to
    // completion.
};

/**
 * TODO
 */
Promise.prototype.thenReject = function Promise_thenReject(error) {
    return this.then(function Promise_thenReject_resolved() {
        throw error;
    }, null, 0);
    // 0: does not contribute significantly to the estimated time to
    // completion.
};

/**
 * TODO
 */
Promise.prototype.all = function Promise_all() {
    return this.then(Q_all);
};

/**
 * Turns an array of promises into a promise for an array of their states (as
 * returned by `inspect`) when they have all settled.
 * @param {Array[Any*]} values an array (or promise for an array) of values (or
 * promises for values)
 * @returns {Array[State]} an array of states for the respective values.
 */
Promise.prototype.allSettled = function Promise_allSettled() {
    return this.then(Q_allSettled);
};

/**
 * TODO
 */
Promise.prototype.catch = function Promise_catch(rejected) {
    return this.then(void 0, rejected);
};

/**
 * TODO
 */
Promise.prototype.finally = function Promise_finally(callback, ms) {
    if (!callback) {
        return this;
    }
    callback = Q(callback);
    return this.then(function (value) {
        return callback.call().then(function Promise_finally_fulfilled() {
            return value;
        });
    }, function (reason) {
        // TODO attempt to recycle the rejection with "this".
        return callback.call().then(function Promise_finally_rejected() {
            throw reason;
        });
    }, ms);
};

/**
 * TODO
 */
Promise.prototype.observeEstimate = function Promise_observeEstimate(emit) {
    this.rawDispatch(null, "estimate", [emit]);
    return this;
};

/**
 * TODO
 */
Promise.prototype.getEstimate = function Promise_getEstimate() {
    return Q_getHandler(this).estimate;
};

/**
 * TODO
 */
Promise.prototype.dispatch = function Promise_dispatch(op, args) {
    var deferred = defer();
    this.rawDispatch(deferred.resolve, op, args);
    return deferred.promise;
};

/**
 */
Promise.prototype.rawDispatch = function Promise_rawDispatch(resolve, op, args) {
    var self = this;
    asap(function Promise_dispatch_task() {
        Q_getHandler(self).dispatch(resolve, op, args);
    });
};

/**
 * TODO
 */
Promise.prototype.get = function Promise_get(name) {
    return this.dispatch("get", [name]);
};

/**
 * TODO
 */
Promise.prototype.invoke = function Promise_invoke(name /*...args*/) {
    var args = new Array(arguments.length - 1);
    for (var index = 1; index < arguments.length; index++) {
        args[index - 1] = arguments[index];
    }
    return this.dispatch("invoke", [name, args]);
};

/**
 * TODO
 */
Promise.prototype.apply = function Promise_apply(thisp, args) {
    return this.dispatch("call", [args, thisp]);
};

/**
 * TODO
 */
Promise.prototype.call = function Promise_call(thisp /*, ...args*/) {
    var args = new Array(Math.max(0, arguments.length - 1));
    for (var index = 1; index < arguments.length; index++) {
        args[index - 1] = arguments[index];
    }
    return this.dispatch("call", [args, thisp]);
};

/**
 * TODO
 */
Promise.prototype.bind = function Promise_bind(thisp /*, ...args*/) {
    var self = this;
    var args = new Array(Math.max(0, arguments.length - 1));
    for (var index = 1; index < arguments.length; index++) {
        args[index - 1] = arguments[index];
    }
    return function Promise_bind_bound(/*...args*/) {
        var boundArgs = args.slice();
        for (var index = 0; index < arguments.length; index++) {
            boundArgs[boundArgs.length] = arguments[index];
        }
        return self.dispatch("call", [boundArgs, thisp]);
    };
};

/**
 * TODO
 */
Promise.prototype.keys = function Promise_keys() {
    return this.dispatch("keys", []);
};

/**
 * TODO
 */
Promise.prototype.iterate = function Promise_iterate() {
    return this.dispatch("iterate", []);
};

/**
 * TODO
 */
Promise.prototype.spread = function Promise_spread(fulfilled, rejected, ms) {
    return this.all().then(function Promise_spread_fulfilled(array) {
        return fulfilled.apply(void 0, array);
    }, rejected, ms);
};

/**
 * Causes a promise to be rejected if it does not get fulfilled before
 * some milliseconds time out.
 * @param {Number} milliseconds timeout
 * @param {String} custom error message (optional)
 * @returns a promise for the resolution of the given promise if it is
 * fulfilled before the timeout, otherwise rejected.
 */
Promise.prototype.timeout = function Promsie_timeout(ms, message) {
    var deferred = defer();
    var timeoutId = setTimeout(function Promise_timeout_task() {
        deferred.reject(new Error(message || "Timed out after " + ms + " ms"));
    }, ms);

    this.then(function Promise_timeout_fulfilled(value) {
        clearTimeout(timeoutId);
        deferred.resolve(value);
    }, function Promise_timeout_rejected(error) {
        clearTimeout(timeoutId);
        deferred.reject(error);
    });

    return deferred.promise;
};

/**
 * Returns a promise for the given value (or promised value), some
 * milliseconds after it resolved. Passes rejections immediately.
 * @param {Any*} promise
 * @param {Number} milliseconds
 * @returns a promise for the resolution of the given promise after milliseconds
 * time has elapsed since the resolution of the given promise.
 * If the given promise rejects, that is passed immediately.
 */
Promise.prototype.delay = function Promise_delay(ms) {
    return this.then(function Promise_delay_fulfilled(value) {
        var deferred = defer();
        deferred.setEstimate(Date.now() + ms);
        setTimeout(function Promise_delay_task() {
            deferred.resolve(value);
        }, ms);
        return deferred.promise;
    }, null, ms);
};

/**
 * TODO
 */
Promise.prototype.pull = function Promise_pull() {
    return this.dispatch("pull", []);
};

/**
 * TODO
 */
Promise.prototype.pass = function Promise_pass() {
    if (!this.toBePassed()) {
        return new Promise(new Passed(this));
    } else {
        return this;
    }
};


// Thus begins the portion dedicated to the deferred

var promises = new WeakMap();

function Deferred(promise) {
    this.promise = promise;
    // A deferred has an intrinsic promise, denoted by its hidden handler
    // property.  The promise property of the deferred may be assigned to a
    // different promise (as it is in a Queue), but the intrinsic promise does
    // not change.
    promises.set(this, promise);
    var self = this;
    var resolve = this.resolve;
    this.resolve = function (value) {
        resolve.call(self, value);
    };
    var reject = this.reject;
    this.reject = function (error) {
        reject.call(self, error);
    };
}

/**
 * TODO
 */
Deferred.prototype.resolve = function Deferred_resolve(value) {
    var handler = Q_getHandler(promises.get(this));
    if (!handler.messages) {
        return;
    }
    handler.become(Q(value));
};

/**
 * TODO
 */
Deferred.prototype.reject = function Deferred_reject(reason) {
    var handler = Q_getHandler(promises.get(this));
    if (!handler.messages) {
        return;
    }
    handler.become(Q_reject(reason));
};

/**
 * TODO
 */
Deferred.prototype.setEstimate = function Deferred_setEstimate(estimate) {
    estimate = +estimate;
    if (estimate !== estimate) {
        estimate = Infinity;
    }
    if (estimate < 1e12 && estimate !== -Infinity) {
        throw new Error("Estimate values should be a number of miliseconds in the future");
    }
    var handler = Q_getHandler(promises.get(this));
    // TODO There is a bit of capability leakage going on here. The Deferred
    // should only be able to set the estimate for its original
    // Pending, not for any handler that promise subsequently became.
    if (handler.setEstimate) {
        handler.setEstimate(estimate);
    }
};

// Thus ends the public interface

// Thus begins the portion dedicated to handlers

function Fulfilled(value) {
    this.value = value;
    this.estimate = Date.now();
}

Fulfilled.prototype.state = "fulfilled";

Fulfilled.prototype.inspect = function Fulfilled_inspect() {
    return {state: "fulfilled", value: this.value};
};

Fulfilled.prototype.dispatch = function Fulfilled_dispatch(
    resolve, op, operands
) {
    var result;
    if (
        op === "then" ||
        op === "get" ||
        op === "call" ||
        op === "invoke" ||
        op === "keys" ||
        op === "iterate" ||
        op === "pull"
    ) {
        try {
            result = this[op].apply(this, operands);
        } catch (exception) {
            result = Q_reject(exception);
        }
    } else if (op === "estimate") {
        operands[0].call(void 0, this.estimate);
    } else {
        var error = new Error(
            "Fulfilled promises do not support the " + op + " operator"
        );
        result = Q_reject(error);
    }
    if (resolve) {
        resolve(result);
    }
};

Fulfilled.prototype.then = function Fulfilled_then() {
    return this.value;
};

Fulfilled.prototype.get = function Fulfilled_get(name) {
    return this.value[name];
};

Fulfilled.prototype.call = function Fulfilled_call(args, thisp) {
    return this.callInvoke(this.value, args, thisp);
};

Fulfilled.prototype.invoke = function Fulfilled_invoke(name, args) {
    return this.callInvoke(this.value[name], args, this.value);
};

Fulfilled.prototype.callInvoke = function Fulfilled_callInvoke(callback, args, thisp) {
    var waitToBePassed;
    for (var index = 0; index < args.length; index++) {
        if (Q_isPromise(args[index]) && args[index].toBePassed()) {
            waitToBePassed = waitToBePassed || [];
            waitToBePassed.push(args[index]);
        }
    }
    if (waitToBePassed) {
        var self = this;
        return Q_all(waitToBePassed).then(function () {
            return self.callInvoke(callback, args.map(function (arg) {
                if (Q_isPromise(arg) && arg.toBePassed()) {
                    return arg.inspect().value;
                } else {
                    return arg;
                }
            }), thisp);
        });
    } else {
        return callback.apply(thisp, args);
    }
};

Fulfilled.prototype.keys = function Fulfilled_keys() {
    return Object.keys(this.value);
};

Fulfilled.prototype.iterate = function Fulfilled_iterate() {
    return iterate(this.value);
};

Fulfilled.prototype.pull = function Fulfilled_pull() {
    var result;
    if (Object(this.value) === this.value) {
        result = Array.isArray(this.value) ? [] : {};
        for (var name in this.value) {
            result[name] = this.value[name];
        }
    } else {
        result = this.value;
    }
    return Q.push(result);
};


function Rejected(reason) {
    this.reason = reason;
    this.estimate = Infinity;
}

Rejected.prototype.state = "rejected";

Rejected.prototype.inspect = function Rejected_inspect() {
    return {state: "rejected", reason: this.reason};
};

Rejected.prototype.dispatch = function Rejected_dispatch(
    resolve, op, operands
) {
    var result;
    if (op === "then") {
        result = this.then(resolve, operands[0]);
    } else {
        result = this;
    }
    if (resolve) {
        resolve(result);
    }
};

Rejected.prototype.then = function Rejected_then(
    resolve, rejected
) {
    return rejected ? rejected(this.reason) : this;
};


function Pending() {
    // if "messages" is an "Array", that indicates that the promise has not yet
    // been resolved.  If it is "undefined", it has been resolved.  Each
    // element of the messages array is itself an array of complete arguments to
    // forward to the resolved promise.  We coerce the resolution value to a
    // promise using the `resolve` function because it handles both fully
    // non-thenable values and other thenables gracefully.
    this.messages = [];
    this.observers = [];
    this.estimate = Infinity;
}

Pending.prototype.state = "pending";

Pending.prototype.inspect = function Pending_inspect() {
    return {state: "pending"};
};

Pending.prototype.dispatch = function Pending_dispatch(resolve, op, operands) {
    this.messages.push([resolve, op, operands]);
    if (op === "estimate") {
        this.observers.push(operands[0]);
        var self = this;
        asap(function Pending_dispatch_task() {
            operands[0].call(void 0, self.estimate);
        });
    }
};

Pending.prototype.become = function Pending_become(promise) {
    this.became = theViciousCycle;
    var handler = Q_getHandler(promise);
    this.became = handler;

    handlers.set(promise, handler);
    this.promise = void 0;

    this.messages.forEach(function Pending_become_eachMessage(message) {
        // makeQ does not have this asap call, so it must be queueing events
        // downstream. TODO look at makeQ to ascertain
        asap(function Pending_become_eachMessage_task() {
            var handler = Q_getHandler(promise);
            handler.dispatch.apply(handler, message);
        });
    });

    this.messages = void 0;
    this.observers = void 0;
};

Pending.prototype.setEstimate = function Pending_setEstimate(estimate) {
    if (this.observers) {
        var self = this;
        self.estimate = estimate;
        this.observers.forEach(function Pending_eachObserver(observer) {
            asap(function Pending_setEstimate_eachObserver_task() {
                observer.call(void 0, estimate);
            });
        });
    }
};

function Thenable(thenable) {
    this.thenable = thenable;
    this.became = null;
    this.estimate = Infinity;
}

Thenable.prototype.state = "thenable";

Thenable.prototype.inspect = function Thenable_inspect() {
    return {state: "pending"};
};

Thenable.prototype.cast = function Thenable_cast() {
    if (!this.became) {
        var deferred = defer();
        var thenable = this.thenable;
        asap(function Thenable_cast_task() {
            try {
                thenable.then(deferred.resolve, deferred.reject);
            } catch (exception) {
                deferred.reject(exception);
            }
        });
        this.became = Q_getHandler(deferred.promise);
    }
    return this.became;
};

Thenable.prototype.dispatch = function Thenable_dispatch(resolve, op, args) {
    this.cast().dispatch(resolve, op, args);
};


function Passed(promise) {
    this.promise = promise;
}

Passed.prototype.state = "passed";

Passed.prototype.inspect = function Passed_inspect() {
    return this.promise.inspect();
};

Passed.prototype.dispatch = function Passed_dispatch(resolve, op, args) {
    return this.promise.rawDispatch(resolve, op, args);
};


// Thus begins the Q Node.js bridge

/**
 * Calls a method of a Node-style object that accepts a Node-style
 * callback, forwarding the given variadic arguments, plus a provided
 * callback argument.
 * @param object an object that has the named method
 * @param {String} name name of the method of object
 * @param ...args arguments to pass to the method; the callback will
 * be provided by Q and appended to these arguments.
 * @returns a promise for the value or error
 */
Q.ninvoke = function Q_ninvoke(object, name /*...args*/) {
    var args = new Array(Math.max(0, arguments.length - 1));
    for (var index = 2; index < arguments.length; index++) {
        args[index - 2] = arguments[index];
    }
    var deferred = Q.defer();
    args[index - 2] = deferred.makeNodeResolver();
    Q(object).dispatch("invoke", [name, args]).catch(deferred.reject);
    return deferred.promise;
};

Promise.prototype.ninvoke = function Promise_ninvoke(name /*...args*/) {
    var args = new Array(arguments.length);
    for (var index = 1; index < arguments.length; index++) {
        args[index - 1] = arguments[index];
    }
    var deferred = Q.defer();
    args[index - 1] = deferred.makeNodeResolver();
    this.dispatch("invoke", [name, args]).catch(deferred.reject);
    return deferred.promise;
};

/**
 * Wraps a Node.js continuation passing function and returns an equivalent
 * version that returns a promise.
 * @example
 * Q.denodeify(FS.readFile)(__filename, "utf-8")
 * .then(console.log)
 * .done()
 */
Q.denodeify = function Q_denodeify(callback, pattern) {
    return function denodeified() {
        var args = new Array(arguments.length + 1);
        var index = 0;
        for (; index < arguments.length; index++) {
            args[index] = arguments[index];
        }
        var deferred = Q.defer();
        args[index] = deferred.makeNodeResolver(pattern);
        Q(callback).apply(this, args).catch(deferred.reject);
        return deferred.promise;
    };
};

/**
 * Creates a Node.js-style callback that will resolve or reject the deferred
 * promise.
 * @param unpack `true` means that the Node.js-style-callback accepts a
 * fixed or variable number of arguments and that the deferred should be resolved
 * with an array of these value arguments, or rejected with the error argument.
 * An array of names means that the Node.js-style-callback accepts a fixed
 * number of arguments, and that the resolution should be an object with
 * properties corresponding to the given names and respective value arguments.
 * @returns a nodeback
 */
Deferred.prototype.makeNodeResolver = function (unpack) {
    var resolve = this.resolve;
    if (unpack === true) {
        return function variadicNodebackToResolver(error) {
            if (error) {
                resolve(Q_reject(error));
            } else {
                var value = new Array(Math.max(0, arguments.length - 1));
                for (var index = 1; index < arguments.length; index++) {
                    value[index - 1] = arguments[index];
                }
                resolve(value);
            }
        };
    } else if (unpack) {
        return function namedArgumentNodebackToResolver(error) {
            if (error) {
                resolve(Q_reject(error));
            } else {
                var value = {};
                for (var index = 0; index < unpack.length; index++) {
                    value[unpack[index]] = arguments[index + 1];
                }
                resolve(value);
            }
        };
    } else {
        return function nodebackToResolver(error, value) {
            if (error) {
                resolve(Q_reject(error));
            } else {
                resolve(value);
            }
        };
    }
};

/**
 * TODO
 */
Promise.prototype.nodeify = function Promise_nodeify(nodeback) {
    if (nodeback) {
        this.done(function (value) {
            nodeback(null, value);
        }, nodeback);
    } else {
        return this;
    }
};


// DEPRECATED

Q.nextTick = deprecate(asap, "nextTick", "asap package");

Q.resolve = deprecate(Q, "resolve", "Q");

Q.fulfill = deprecate(Q, "fulfill", "Q");

Q.isPromiseAlike = deprecate(isThenable, "isPromiseAlike", "(not supported)");

Q.fail = deprecate(function (value, rejected) {
    return Q(value).catch(rejected);
}, "Q.fail", "Q(value).catch");

Q.fin = deprecate(function (value, regardless) {
    return Q(value).finally(regardless);
}, "Q.fin", "Q(value).finally");

Q.progress = deprecate(function (value) {
    return value;
}, "Q.progress", "no longer supported");

Q.thenResolve = deprecate(function (promise, value) {
    return Q(promise).thenResolve(value);
}, "thenResolve", "Q(value).thenResolve");

Q.thenReject = deprecate(function (promise, reason) {
    return Q(promise).thenResolve(reason);
}, "thenResolve", "Q(value).thenResolve");

Q.isPending = deprecate(function (value) {
    return Q(value).isPending();
}, "isPending", "Q(value).isPending");

Q.isFulfilled = deprecate(function (value) {
    return Q(value).isFulfilled();
}, "isFulfilled", "Q(value).isFulfilled");

Q.isRejected = deprecate(function (value) {
    return Q(value).isRejected();
}, "isRejected", "Q(value).isRejected");

Q.master = deprecate(function (value) {
    return value;
}, "master", "no longer necessary");

Q.makePromise = function () {
    throw new Error("makePromise is no longer supported");
};

Q.dispatch = deprecate(function (value, op, operands) {
    return Q(value).dispatch(op, operands);
}, "dispatch", "Q(value).dispatch");

Q.get = deprecate(function (object, name) {
    return Q(object).get(name);
}, "get", "Q(value).get");

Q.keys = deprecate(function (object) {
    return Q(object).keys();
}, "keys", "Q(value).keys");

Q.post = deprecate(function (object, name, args) {
    return Q(object).post(name, args);
}, "post", "Q(value).invoke (spread arguments)");

Q.mapply = deprecate(function (object, name, args) {
    return Q(object).post(name, args);
}, "post", "Q(value).invoke (spread arguments)");

Q.send = deprecate(function (object, name) {
    return Q(object).post(name, Array.prototype.slice.call(arguments, 2));
}, "send", "Q(value).invoke");

Q.set = function () {
    throw new Error("Q.set no longer supported");
};

Q.delete = function () {
    throw new Error("Q.delete no longer supported");
};

Q.nearer = deprecate(function (value) {
    if (Q_isPromise(value) && value.isFulfilled()) {
        return value.inspect().value;
    } else {
        return value;
    }
}, "nearer", "inspect().value (+nuances)");

Q.fapply = deprecate(function (callback, args) {
    return Q(callback).dispatch("call", [args]);
}, "fapply", "Q(callback).apply(thisp, args)");

Q.fcall = deprecate(function (callback /*, ...args*/) {
    return Q(callback).dispatch("call", [Array.prototype.slice.call(arguments, 1)]);
}, "fcall", "Q(callback).call(thisp, ...args)");

Q.fbind = deprecate(function (object /*...args*/) {
    var promise = Q(object);
    var args = Array.prototype.slice.call(arguments, 1);
    return function fbound() {
        return promise.dispatch("call", [
            args.concat(Array.prototype.slice.call(arguments)),
            this
        ]);
    };
}, "fbind", "bind with thisp");

Q.promise = deprecate(Promise, "promise", "Promise");

Promise.prototype.fapply = deprecate(function (args) {
    return this.dispatch("call", [args]);
}, "fapply", "apply with thisp");

Promise.prototype.fcall = deprecate(function (/*...args*/) {
    return this.dispatch("call", [Array.prototype.slice.call(arguments)]);
}, "fcall", "try or call with thisp");

Promise.prototype.fail = deprecate(function (rejected) {
    return this.catch(rejected);
}, "fail", "catch");

Promise.prototype.fin = deprecate(function (regardless) {
    return this.finally(regardless);
}, "fin", "finally");

Promise.prototype.set = function () {
    throw new Error("Promise set no longer supported");
};

Promise.prototype.delete = function () {
    throw new Error("Promise delete no longer supported");
};

Deferred.prototype.notify = deprecate(function () {
}, "notify", "no longer supported");

Promise.prototype.progress = deprecate(function () {
    return this;
}, "progress", "no longer supported");

// alternative proposed by Redsandro, dropped in favor of post to streamline
// the interface
Promise.prototype.mapply = deprecate(function (name, args) {
    return this.dispatch("invoke", [name, args]);
}, "mapply", "invoke");

Promise.prototype.fbind = deprecate(function () {
    return Q.fbind.apply(Q, [void 0].concat(Array.prototype.slice.call(arguments)));
}, "fbind", "bind(thisp, ...args)");

// alternative proposed by Mark Miller, dropped in favor of invoke
Promise.prototype.send = deprecate(function () {
    return this.dispatch("invoke", [name, Array.prototype.slice.call(arguments, 1)]);
}, "send", "invoke");

// alternative proposed by Redsandro, dropped in favor of invoke
Promise.prototype.mcall = deprecate(function () {
    return this.dispatch("invoke", [name, Array.prototype.slice.call(arguments, 1)]);
}, "mcall", "invoke");

Promise.prototype.passByCopy = deprecate(function (value) {
    return value;
}, "passByCopy", "Q.passByCopy");

// Deprecated Node.js bridge promise methods

Q.nfapply = deprecate(function (callback, args) {
    var deferred = Q.defer();
    var nodeArgs = Array.prototype.slice.call(args);
    nodeArgs.push(deferred.makeNodeResolver());
    Q(callback).apply(this, nodeArgs).catch(deferred.reject);
    return deferred.promise;
}, "nfapply");

Promise.prototype.nfapply = deprecate(function (args) {
    return Q.nfapply(this, args);
}, "nfapply");

Q.nfcall = deprecate(function (callback /*...args*/) {
    var args = Array.prototype.slice.call(arguments, 1);
    return Q.nfapply(callback, args);
}, "nfcall");

Promise.prototype.nfcall = deprecate(function () {
    var args = new Array(arguments.length);
    for (var index = 0; index < arguments.length; index++) {
        args[index] = arguments[index];
    }
    return Q.nfapply(this, args);
}, "nfcall");

Q.nfbind = deprecate(function (callback /*...args*/) {
    var baseArgs = Array.prototype.slice.call(arguments, 1);
    return function () {
        var nodeArgs = baseArgs.concat(Array.prototype.slice.call(arguments));
        var deferred = Q.defer();
        nodeArgs.push(deferred.makeNodeResolver());
        Q(callback).apply(this, nodeArgs).catch(deferred.reject);
        return deferred.promise;
    };
}, "nfbind", "denodeify (with caveats)");

Promise.prototype.nfbind = deprecate(function () {
    var args = new Array(arguments.length);
    for (var index = 0; index < arguments.length; index++) {
        args[index] = arguments[index];
    }
    return Q.nfbind(this, args);
}, "nfbind", "denodeify (with caveats)");

Q.nbind = deprecate(function (callback, thisp /*...args*/) {
    var baseArgs = Array.prototype.slice.call(arguments, 2);
    return function () {
        var nodeArgs = baseArgs.concat(Array.prototype.slice.call(arguments));
        var deferred = Q.defer();
        nodeArgs.push(deferred.makeNodeResolver());
        function bound() {
            return callback.apply(thisp, arguments);
        }
        Q(bound).apply(this, nodeArgs).catch(deferred.reject);
        return deferred.promise;
    };
}, "nbind", "denodeify (with caveats)");

Q.npost = deprecate(function (object, name, nodeArgs) {
    var deferred = Q.defer();
    nodeArgs.push(deferred.makeNodeResolver());
    Q(object).dispatch("invoke", [name, nodeArgs]).catch(deferred.reject);
    return deferred.promise;
}, "npost", "ninvoke (with spread arguments)");

Promise.prototype.npost = deprecate(function (name, args) {
    return Q.npost(this, name, args);
}, "npost", "Q.ninvoke (with caveats)");

Q.nmapply = deprecate(Q.nmapply, "nmapply", "q/node nmapply");
Promise.prototype.nmapply = deprecate(Promise.prototype.npost, "nmapply", "Q.nmapply");

Q.nsend = deprecate(Q.ninvoke, "nsend", "q/node ninvoke");
Q.nmcall = deprecate(Q.ninvoke, "nmcall", "q/node ninvoke");
Promise.prototype.nsend = deprecate(Promise.prototype.ninvoke, "nsend", "q/node ninvoke");
Promise.prototype.nmcall = deprecate(Promise.prototype.ninvoke, "nmcall", "q/node ninvoke");

// All code before this point will be filtered from stack traces.
var qEndingLine = captureLine();

}],["weak-map","weak-map",{},function (require, exports, module){

// weak-map weak-map
// -----------------

// Copyright (C) 2011 Google Inc.
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
// http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

/**
 * @fileoverview Install a leaky WeakMap emulation on platforms that
 * don't provide a built-in one.
 *
 * <p>Assumes that an ES5 platform where, if {@code WeakMap} is
 * already present, then it conforms to the anticipated ES6
 * specification. To run this file on an ES5 or almost ES5
 * implementation where the {@code WeakMap} specification does not
 * quite conform, run <code>repairES5.js</code> first.
 *
 * <p>Even though WeakMapModule is not global, the linter thinks it
 * is, which is why it is in the overrides list below.
 *
 * <p>NOTE: Before using this WeakMap emulation in a non-SES
 * environment, see the note below about hiddenRecord.
 *
 * @author Mark S. Miller
 * @requires crypto, ArrayBuffer, Uint8Array, navigator, console
 * @overrides WeakMap, ses, Proxy
 * @overrides WeakMapModule
 */

/**
 * This {@code WeakMap} emulation is observably equivalent to the
 * ES-Harmony WeakMap, but with leakier garbage collection properties.
 *
 * <p>As with true WeakMaps, in this emulation, a key does not
 * retain maps indexed by that key and (crucially) a map does not
 * retain the keys it indexes. A map by itself also does not retain
 * the values associated with that map.
 *
 * <p>However, the values associated with a key in some map are
 * retained so long as that key is retained and those associations are
 * not overridden. For example, when used to support membranes, all
 * values exported from a given membrane will live for the lifetime
 * they would have had in the absence of an interposed membrane. Even
 * when the membrane is revoked, all objects that would have been
 * reachable in the absence of revocation will still be reachable, as
 * far as the GC can tell, even though they will no longer be relevant
 * to ongoing computation.
 *
 * <p>The API implemented here is approximately the API as implemented
 * in FF6.0a1 and agreed to by MarkM, Andreas Gal, and Dave Herman,
 * rather than the offially approved proposal page. TODO(erights):
 * upgrade the ecmascript WeakMap proposal page to explain this API
 * change and present to EcmaScript committee for their approval.
 *
 * <p>The first difference between the emulation here and that in
 * FF6.0a1 is the presence of non enumerable {@code get___, has___,
 * set___, and delete___} methods on WeakMap instances to represent
 * what would be the hidden internal properties of a primitive
 * implementation. Whereas the FF6.0a1 WeakMap.prototype methods
 * require their {@code this} to be a genuine WeakMap instance (i.e.,
 * an object of {@code [[Class]]} "WeakMap}), since there is nothing
 * unforgeable about the pseudo-internal method names used here,
 * nothing prevents these emulated prototype methods from being
 * applied to non-WeakMaps with pseudo-internal methods of the same
 * names.
 *
 * <p>Another difference is that our emulated {@code
 * WeakMap.prototype} is not itself a WeakMap. A problem with the
 * current FF6.0a1 API is that WeakMap.prototype is itself a WeakMap
 * providing ambient mutability and an ambient communications
 * channel. Thus, if a WeakMap is already present and has this
 * problem, repairES5.js wraps it in a safe wrappper in order to
 * prevent access to this channel. (See
 * PATCH_MUTABLE_FROZEN_WEAKMAP_PROTO in repairES5.js).
 */

/**
 * If this is a full <a href=
 * "http://code.google.com/p/es-lab/wiki/SecureableES5"
 * >secureable ES5</a> platform and the ES-Harmony {@code WeakMap} is
 * absent, install an approximate emulation.
 *
 * <p>If WeakMap is present but cannot store some objects, use our approximate
 * emulation as a wrapper.
 *
 * <p>If this is almost a secureable ES5 platform, then WeakMap.js
 * should be run after repairES5.js.
 *
 * <p>See {@code WeakMap} for documentation of the garbage collection
 * properties of this WeakMap emulation.
 */
(function WeakMapModule() {
  "use strict";

  if (typeof ses !== 'undefined' && ses.ok && !ses.ok()) {
    // already too broken, so give up
    return;
  }

  /**
   * In some cases (current Firefox), we must make a choice betweeen a
   * WeakMap which is capable of using all varieties of host objects as
   * keys and one which is capable of safely using proxies as keys. See
   * comments below about HostWeakMap and DoubleWeakMap for details.
   *
   * This function (which is a global, not exposed to guests) marks a
   * WeakMap as permitted to do what is necessary to index all host
   * objects, at the cost of making it unsafe for proxies.
   *
   * Do not apply this function to anything which is not a genuine
   * fresh WeakMap.
   */
  function weakMapPermitHostObjects(map) {
    // identity of function used as a secret -- good enough and cheap
    if (map.permitHostObjects___) {
      map.permitHostObjects___(weakMapPermitHostObjects);
    }
  }
  if (typeof ses !== 'undefined') {
    ses.weakMapPermitHostObjects = weakMapPermitHostObjects;
  }

  // IE 11 has no Proxy but has a broken WeakMap such that we need to patch
  // it using DoubleWeakMap; this flag tells DoubleWeakMap so.
  var doubleWeakMapCheckSilentFailure = false;

  // Check if there is already a good-enough WeakMap implementation, and if so
  // exit without replacing it.
  if (typeof WeakMap === 'function') {
    var HostWeakMap = WeakMap;
    // There is a WeakMap -- is it good enough?
    if (typeof navigator !== 'undefined' &&
        /Firefox/.test(navigator.userAgent)) {
      // We're now *assuming not*, because as of this writing (2013-05-06)
      // Firefox's WeakMaps have a miscellany of objects they won't accept, and
      // we don't want to make an exhaustive list, and testing for just one
      // will be a problem if that one is fixed alone (as they did for Event).

      // If there is a platform that we *can* reliably test on, here's how to
      // do it:
      //  var problematic = ... ;
      //  var testHostMap = new HostWeakMap();
      //  try {
      //    testHostMap.set(problematic, 1);  // Firefox 20 will throw here
      //    if (testHostMap.get(problematic) === 1) {
      //      return;
      //    }
      //  } catch (e) {}

    } else {
      // IE 11 bug: WeakMaps silently fail to store frozen objects.
      var testMap = new HostWeakMap();
      var testObject = Object.freeze({});
      testMap.set(testObject, 1);
      if (testMap.get(testObject) !== 1) {
        doubleWeakMapCheckSilentFailure = true;
        // Fall through to installing our WeakMap.
      } else {
        module.exports = WeakMap;
        return;
      }
    }
  }

  var hop = Object.prototype.hasOwnProperty;
  var gopn = Object.getOwnPropertyNames;
  var defProp = Object.defineProperty;
  var isExtensible = Object.isExtensible;

  /**
   * Security depends on HIDDEN_NAME being both <i>unguessable</i> and
   * <i>undiscoverable</i> by untrusted code.
   *
   * <p>Given the known weaknesses of Math.random() on existing
   * browsers, it does not generate unguessability we can be confident
   * of.
   *
   * <p>It is the monkey patching logic in this file that is intended
   * to ensure undiscoverability. The basic idea is that there are
   * three fundamental means of discovering properties of an object:
   * The for/in loop, Object.keys(), and Object.getOwnPropertyNames(),
   * as well as some proposed ES6 extensions that appear on our
   * whitelist. The first two only discover enumerable properties, and
   * we only use HIDDEN_NAME to name a non-enumerable property, so the
   * only remaining threat should be getOwnPropertyNames and some
   * proposed ES6 extensions that appear on our whitelist. We monkey
   * patch them to remove HIDDEN_NAME from the list of properties they
   * returns.
   *
   * <p>TODO(erights): On a platform with built-in Proxies, proxies
   * could be used to trap and thereby discover the HIDDEN_NAME, so we
   * need to monkey patch Proxy.create, Proxy.createFunction, etc, in
   * order to wrap the provided handler with the real handler which
   * filters out all traps using HIDDEN_NAME.
   *
   * <p>TODO(erights): Revisit Mike Stay's suggestion that we use an
   * encapsulated function at a not-necessarily-secret name, which
   * uses the Stiegler shared-state rights amplification pattern to
   * reveal the associated value only to the WeakMap in which this key
   * is associated with that value. Since only the key retains the
   * function, the function can also remember the key without causing
   * leakage of the key, so this doesn't violate our general gc
   * goals. In addition, because the name need not be a guarded
   * secret, we could efficiently handle cross-frame frozen keys.
   */
  var HIDDEN_NAME_PREFIX = 'weakmap:';
  var HIDDEN_NAME = HIDDEN_NAME_PREFIX + 'ident:' + Math.random() + '___';

  if (typeof crypto !== 'undefined' &&
      typeof crypto.getRandomValues === 'function' &&
      typeof ArrayBuffer === 'function' &&
      typeof Uint8Array === 'function') {
    var ab = new ArrayBuffer(25);
    var u8s = new Uint8Array(ab);
    crypto.getRandomValues(u8s);
    HIDDEN_NAME = HIDDEN_NAME_PREFIX + 'rand:' +
      Array.prototype.map.call(u8s, function(u8) {
        return (u8 % 36).toString(36);
      }).join('') + '___';
  }

  function isNotHiddenName(name) {
    return !(
        name.substr(0, HIDDEN_NAME_PREFIX.length) == HIDDEN_NAME_PREFIX &&
        name.substr(name.length - 3) === '___');
  }

  /**
   * Monkey patch getOwnPropertyNames to avoid revealing the
   * HIDDEN_NAME.
   *
   * <p>The ES5.1 spec requires each name to appear only once, but as
   * of this writing, this requirement is controversial for ES6, so we
   * made this code robust against this case. If the resulting extra
   * search turns out to be expensive, we can probably relax this once
   * ES6 is adequately supported on all major browsers, iff no browser
   * versions we support at that time have relaxed this constraint
   * without providing built-in ES6 WeakMaps.
   */
  defProp(Object, 'getOwnPropertyNames', {
    value: function fakeGetOwnPropertyNames(obj) {
      return gopn(obj).filter(isNotHiddenName);
    }
  });

  /**
   * getPropertyNames is not in ES5 but it is proposed for ES6 and
   * does appear in our whitelist, so we need to clean it too.
   */
  if ('getPropertyNames' in Object) {
    var originalGetPropertyNames = Object.getPropertyNames;
    defProp(Object, 'getPropertyNames', {
      value: function fakeGetPropertyNames(obj) {
        return originalGetPropertyNames(obj).filter(isNotHiddenName);
      }
    });
  }

  /**
   * <p>To treat objects as identity-keys with reasonable efficiency
   * on ES5 by itself (i.e., without any object-keyed collections), we
   * need to add a hidden property to such key objects when we
   * can. This raises several issues:
   * <ul>
   * <li>Arranging to add this property to objects before we lose the
   *     chance, and
   * <li>Hiding the existence of this new property from most
   *     JavaScript code.
   * <li>Preventing <i>certification theft</i>, where one object is
   *     created falsely claiming to be the key of an association
   *     actually keyed by another object.
   * <li>Preventing <i>value theft</i>, where untrusted code with
   *     access to a key object but not a weak map nevertheless
   *     obtains access to the value associated with that key in that
   *     weak map.
   * </ul>
   * We do so by
   * <ul>
   * <li>Making the name of the hidden property unguessable, so "[]"
   *     indexing, which we cannot intercept, cannot be used to access
   *     a property without knowing the name.
   * <li>Making the hidden property non-enumerable, so we need not
   *     worry about for-in loops or {@code Object.keys},
   * <li>monkey patching those reflective methods that would
   *     prevent extensions, to add this hidden property first,
   * <li>monkey patching those methods that would reveal this
   *     hidden property.
   * </ul>
   * Unfortunately, because of same-origin iframes, we cannot reliably
   * add this hidden property before an object becomes
   * non-extensible. Instead, if we encounter a non-extensible object
   * without a hidden record that we can detect (whether or not it has
   * a hidden record stored under a name secret to us), then we just
   * use the key object itself to represent its identity in a brute
   * force leaky map stored in the weak map, losing all the advantages
   * of weakness for these.
   */
  function getHiddenRecord(key) {
    if (key !== Object(key)) {
      throw new TypeError('Not an object: ' + key);
    }
    var hiddenRecord = key[HIDDEN_NAME];
    if (hiddenRecord && hiddenRecord.key === key) { return hiddenRecord; }
    if (!isExtensible(key)) {
      // Weak map must brute force, as explained in doc-comment above.
      return void 0;
    }

    // The hiddenRecord and the key point directly at each other, via
    // the "key" and HIDDEN_NAME properties respectively. The key
    // field is for quickly verifying that this hidden record is an
    // own property, not a hidden record from up the prototype chain.
    //
    // NOTE: Because this WeakMap emulation is meant only for systems like
    // SES where Object.prototype is frozen without any numeric
    // properties, it is ok to use an object literal for the hiddenRecord.
    // This has two advantages:
    // * It is much faster in a performance critical place
    // * It avoids relying on Object.create(null), which had been
    //   problematic on Chrome 28.0.1480.0. See
    //   https://code.google.com/p/google-caja/issues/detail?id=1687
    hiddenRecord = { key: key };

    // When using this WeakMap emulation on platforms where
    // Object.prototype might not be frozen and Object.create(null) is
    // reliable, use the following two commented out lines instead.
    // hiddenRecord = Object.create(null);
    // hiddenRecord.key = key;

    // Please contact us if you need this to work on platforms where
    // Object.prototype might not be frozen and
    // Object.create(null) might not be reliable.

    try {
      defProp(key, HIDDEN_NAME, {
        value: hiddenRecord,
        writable: false,
        enumerable: false,
        configurable: false
      });
      return hiddenRecord;
    } catch (error) {
      // Under some circumstances, isExtensible seems to misreport whether
      // the HIDDEN_NAME can be defined.
      // The circumstances have not been isolated, but at least affect
      // Node.js v0.10.26 on TravisCI / Linux, but not the same version of
      // Node.js on OS X.
      return void 0;
    }
  }

  /**
   * Monkey patch operations that would make their argument
   * non-extensible.
   *
   * <p>The monkey patched versions throw a TypeError if their
   * argument is not an object, so it should only be done to functions
   * that should throw a TypeError anyway if their argument is not an
   * object.
   */
  (function(){
    var oldFreeze = Object.freeze;
    defProp(Object, 'freeze', {
      value: function identifyingFreeze(obj) {
        getHiddenRecord(obj);
        return oldFreeze(obj);
      }
    });
    var oldSeal = Object.seal;
    defProp(Object, 'seal', {
      value: function identifyingSeal(obj) {
        getHiddenRecord(obj);
        return oldSeal(obj);
      }
    });
    var oldPreventExtensions = Object.preventExtensions;
    defProp(Object, 'preventExtensions', {
      value: function identifyingPreventExtensions(obj) {
        getHiddenRecord(obj);
        return oldPreventExtensions(obj);
      }
    });
  })();

  function constFunc(func) {
    func.prototype = null;
    return Object.freeze(func);
  }

  var calledAsFunctionWarningDone = false;
  function calledAsFunctionWarning() {
    // Future ES6 WeakMap is currently (2013-09-10) expected to reject WeakMap()
    // but we used to permit it and do it ourselves, so warn only.
    if (!calledAsFunctionWarningDone && typeof console !== 'undefined') {
      calledAsFunctionWarningDone = true;
      console.warn('WeakMap should be invoked as new WeakMap(), not ' +
          'WeakMap(). This will be an error in the future.');
    }
  }

  var nextId = 0;

  var OurWeakMap = function() {
    if (!(this instanceof OurWeakMap)) {  // approximate test for new ...()
      calledAsFunctionWarning();
    }

    // We are currently (12/25/2012) never encountering any prematurely
    // non-extensible keys.
    var keys = []; // brute force for prematurely non-extensible keys.
    var values = []; // brute force for corresponding values.
    var id = nextId++;

    function get___(key, opt_default) {
      var index;
      var hiddenRecord = getHiddenRecord(key);
      if (hiddenRecord) {
        return id in hiddenRecord ? hiddenRecord[id] : opt_default;
      } else {
        index = keys.indexOf(key);
        return index >= 0 ? values[index] : opt_default;
      }
    }

    function has___(key) {
      var hiddenRecord = getHiddenRecord(key);
      if (hiddenRecord) {
        return id in hiddenRecord;
      } else {
        return keys.indexOf(key) >= 0;
      }
    }

    function set___(key, value) {
      var index;
      var hiddenRecord = getHiddenRecord(key);
      if (hiddenRecord) {
        hiddenRecord[id] = value;
      } else {
        index = keys.indexOf(key);
        if (index >= 0) {
          values[index] = value;
        } else {
          // Since some browsers preemptively terminate slow turns but
          // then continue computing with presumably corrupted heap
          // state, we here defensively get keys.length first and then
          // use it to update both the values and keys arrays, keeping
          // them in sync.
          index = keys.length;
          values[index] = value;
          // If we crash here, values will be one longer than keys.
          keys[index] = key;
        }
      }
      return this;
    }

    function delete___(key) {
      var hiddenRecord = getHiddenRecord(key);
      var index, lastIndex;
      if (hiddenRecord) {
        return id in hiddenRecord && delete hiddenRecord[id];
      } else {
        index = keys.indexOf(key);
        if (index < 0) {
          return false;
        }
        // Since some browsers preemptively terminate slow turns but
        // then continue computing with potentially corrupted heap
        // state, we here defensively get keys.length first and then use
        // it to update both the keys and the values array, keeping
        // them in sync. We update the two with an order of assignments,
        // such that any prefix of these assignments will preserve the
        // key/value correspondence, either before or after the delete.
        // Note that this needs to work correctly when index === lastIndex.
        lastIndex = keys.length - 1;
        keys[index] = void 0;
        // If we crash here, there's a void 0 in the keys array, but
        // no operation will cause a "keys.indexOf(void 0)", since
        // getHiddenRecord(void 0) will always throw an error first.
        values[index] = values[lastIndex];
        // If we crash here, values[index] cannot be found here,
        // because keys[index] is void 0.
        keys[index] = keys[lastIndex];
        // If index === lastIndex and we crash here, then keys[index]
        // is still void 0, since the aliasing killed the previous key.
        keys.length = lastIndex;
        // If we crash here, keys will be one shorter than values.
        values.length = lastIndex;
        return true;
      }
    }

    return Object.create(OurWeakMap.prototype, {
      get___:    { value: constFunc(get___) },
      has___:    { value: constFunc(has___) },
      set___:    { value: constFunc(set___) },
      delete___: { value: constFunc(delete___) }
    });
  };

  OurWeakMap.prototype = Object.create(Object.prototype, {
    get: {
      /**
       * Return the value most recently associated with key, or
       * opt_default if none.
       */
      value: function get(key, opt_default) {
        return this.get___(key, opt_default);
      },
      writable: true,
      configurable: true
    },

    has: {
      /**
       * Is there a value associated with key in this WeakMap?
       */
      value: function has(key) {
        return this.has___(key);
      },
      writable: true,
      configurable: true
    },

    set: {
      /**
       * Associate value with key in this WeakMap, overwriting any
       * previous association if present.
       */
      value: function set(key, value) {
        return this.set___(key, value);
      },
      writable: true,
      configurable: true
    },

    'delete': {
      /**
       * Remove any association for key in this WeakMap, returning
       * whether there was one.
       *
       * <p>Note that the boolean return here does not work like the
       * {@code delete} operator. The {@code delete} operator returns
       * whether the deletion succeeds at bringing about a state in
       * which the deleted property is absent. The {@code delete}
       * operator therefore returns true if the property was already
       * absent, whereas this {@code delete} method returns false if
       * the association was already absent.
       */
      value: function remove(key) {
        return this.delete___(key);
      },
      writable: true,
      configurable: true
    }
  });

  if (typeof HostWeakMap === 'function') {
    (function() {
      // If we got here, then the platform has a WeakMap but we are concerned
      // that it may refuse to store some key types. Therefore, make a map
      // implementation which makes use of both as possible.

      // In this mode we are always using double maps, so we are not proxy-safe.
      // This combination does not occur in any known browser, but we had best
      // be safe.
      if (doubleWeakMapCheckSilentFailure && typeof Proxy !== 'undefined') {
        Proxy = undefined;
      }

      function DoubleWeakMap() {
        if (!(this instanceof OurWeakMap)) {  // approximate test for new ...()
          calledAsFunctionWarning();
        }

        // Preferable, truly weak map.
        var hmap = new HostWeakMap();

        // Our hidden-property-based pseudo-weak-map. Lazily initialized in the
        // 'set' implementation; thus we can avoid performing extra lookups if
        // we know all entries actually stored are entered in 'hmap'.
        var omap = undefined;

        // Hidden-property maps are not compatible with proxies because proxies
        // can observe the hidden name and either accidentally expose it or fail
        // to allow the hidden property to be set. Therefore, we do not allow
        // arbitrary WeakMaps to switch to using hidden properties, but only
        // those which need the ability, and unprivileged code is not allowed
        // to set the flag.
        //
        // (Except in doubleWeakMapCheckSilentFailure mode in which case we
        // disable proxies.)
        var enableSwitching = false;

        function dget(key, opt_default) {
          if (omap) {
            return hmap.has(key) ? hmap.get(key)
                : omap.get___(key, opt_default);
          } else {
            return hmap.get(key, opt_default);
          }
        }

        function dhas(key) {
          return hmap.has(key) || (omap ? omap.has___(key) : false);
        }

        var dset;
        if (doubleWeakMapCheckSilentFailure) {
          dset = function(key, value) {
            hmap.set(key, value);
            if (!hmap.has(key)) {
              if (!omap) { omap = new OurWeakMap(); }
              omap.set(key, value);
            }
            return this;
          };
        } else {
          dset = function(key, value) {
            if (enableSwitching) {
              try {
                hmap.set(key, value);
              } catch (e) {
                if (!omap) { omap = new OurWeakMap(); }
                omap.set___(key, value);
              }
            } else {
              hmap.set(key, value);
            }
            return this;
          };
        }

        function ddelete(key) {
          var result = !!hmap['delete'](key);
          if (omap) { return omap.delete___(key) || result; }
          return result;
        }

        return Object.create(OurWeakMap.prototype, {
          get___:    { value: constFunc(dget) },
          has___:    { value: constFunc(dhas) },
          set___:    { value: constFunc(dset) },
          delete___: { value: constFunc(ddelete) },
          permitHostObjects___: { value: constFunc(function(token) {
            if (token === weakMapPermitHostObjects) {
              enableSwitching = true;
            } else {
              throw new Error('bogus call to permitHostObjects___');
            }
          })}
        });
      }
      DoubleWeakMap.prototype = OurWeakMap.prototype;
      module.exports = DoubleWeakMap;

      // define .constructor to hide OurWeakMap ctor
      Object.defineProperty(WeakMap.prototype, 'constructor', {
        value: WeakMap,
        enumerable: false,  // as default .constructor is
        configurable: true,
        writable: true
      });
    })();
  } else {
    // There is no host WeakMap, so we must use the emulation.

    // Emulated WeakMaps are incompatible with native proxies (because proxies
    // can observe the hidden name), so we must disable Proxy usage (in
    // ArrayLike and Domado, currently).
    if (typeof Proxy !== 'undefined') {
      Proxy = undefined;
    }

    module.exports = OurWeakMap;
  }
})();
}]]})(this))().done()
