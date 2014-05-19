"use strict";

var Require = require("../require");
var URL = require("url");
var Promise = require("bluebird");
var getParams = require("./script-params");

module.exports = boot;
function boot(preloaded, params) {
    params = params || getParams("boot.js");

    var config = {preloaded: preloaded};
    var applicationLocation = URL.resolve(Require.getLocation(), params.package || ".");
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
                name: "bluebird",
                location: params.bluebirdLocation,
                hash: params.bluebirdHash
            })
            .then(function (bluebirdRequire) {
                bluebirdRequire.inject("bluebird", Promise);
                mrRequire.inject("mini-url", URL);
                mrRequire.inject("require", Require);
                return applicationRequire.async(moduleId);
            });
        });
    });

}

