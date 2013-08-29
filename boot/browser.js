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

    return Require.loadPackage({
        location: params.location,
        hash: params.mrHash
    }, config)
    .then(function (mrRequire) {
        mrRequire.inject("mini-url", URL);
        mrRequire.inject("require", Require);

        return mrRequire.loadPackage({
            name: "q",
            location: params.qLocation,
            hash: params.qHash
        })
        .then(function (qRequire) {
            qRequire.inject("q", Q);

            if ("autoPackage" in params) {
                mrRequire.injectPackageDescription(applicationLocation, {});
            }

            return mrRequire.loadPackage({
                location: applicationLocation,
                hash: params.applicationHash
            })
            .invoke('async', moduleId);

        });
    });

}

