#!/usr/bin/env node

var Require = require("../require");
var Optimist = require("optimist");
var URL = require("url");
var Q = require("q");
var FS = require("q-io/fs");

var argv = Optimist.argv;
var program = argv._.shift();

Require.findPackageLocationAndModuleId(program)
.then(function (info) {
    return Require.loadPackage(info.location, {})
    .then(function (pkg) {
        return pkg.async(info.id);
    });
}, function (error) {
    var location = Require.filePathToLocation(program);
    var directory = URL.resolve(location, "./");
    var file = FS.relativeFromDirectory(directory, location);
    var descriptions = {};
    descriptions[directory] = Q({});
    return Require.loadPackage(directory, {
        descriptions: descriptions
    }).then(function (pkg) {
        return pkg.async(file);
    });
})
.done();
