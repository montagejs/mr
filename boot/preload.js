
var load = require("../script");
var URL = require("url");
var Promise = require("bluebird");

function makeDefer() {
    var defer = {
        promise: new Promise(function (resolve, reject) {
            defer.resolve = resolve;
            defer.reject = reject;
        })
    };
    return defer;
}

module.exports = function preload(plan, params) {

    // Each bundle ends with a bundleLoaded(name) call.  We use these hooks to
    // synchronize the preloader.
    var bundleHooks = {};
    var getHook = function (name) {
        return bundleHooks[name] = bundleHooks[name] || makeDefer();
    };
    global.bundleLoaded = function (name) {
        getHook(name).resolve();
    };

    // preload bundles sequentially
    var preloaded = plan.reduce(function (previous, bundleLocations) {
        return previous.then(function () {
            return Promise.all(bundleLocations.map(function (bundleLocation) {
                load(URL.resolve(params.location, bundleLocation));
                return getHook(bundleLocation).promise;
            }));
        });
    }, Promise.resolve())
    .then(function () {
        // remove evidence of the evil we have done to the global scope
        delete global.bundleLoaded;
    });

    return preloaded;
};

