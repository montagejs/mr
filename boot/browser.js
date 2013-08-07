"use strict";

var Require = require("../browser");
var URL = require("url");
var Q = require("q");

var params = require("./script-params")("boot.js");

module.exports = boot;
function boot(preloaded) {

    var config = {preloaded: preloaded};
    var applicationLocation = URL.resolve(window.location, params.package || ".");
    var moduleId = params.module || "";

    if ("autoPackage" in params) {
        Require.injectPackageDescription(applicationLocation, {});
    }

    return Require.loadPackage({
        location: applicationLocation,
        hash: params.applicationHash
    })
    .then(function (applicationRequire) {
        return applicationRequire.loadPackage({
            location: params.location,
            hash: params.mrHash
        }, config)
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

