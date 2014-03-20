#!/usr/bin/env node

var ChildProcess = require("child_process");
var Q = require("q");
var QS = require("qs");
var Fs = require("q-io/fs");
var Joey = require("joey");
var Require = require("../require");

var files = (process.argv[2] || "").split(/\s+/);

module.exports = boot;
function boot() {
    return Require.findPackageLocationAndModuleId(files[0])
    .then(function (found) {
        var path = Require.locationToPath(found.location);
        var modules = files.map(function (file) {
            return Fs.relativeFromDirectory(path, file);
        });

        var server = Joey
        .route(function ($) {
            $("~/...").fileTree(Fs.join(__dirname, ".."), {
                followInsecureSymbolicLinks: true
            });
        })
        .fileTree(path, {
            followInsecureSymbolicLinks: true
        })
        .server();

        return server.listen(0)
        .then(function (server) {
            var codeDeferred = Q.defer();
            var port = server.address().port;
            var child = ChildProcess.spawn("phantomjs", [
                Fs.join(__dirname, "script.js"),
                "http://localhost:" + port + "/~/phantom/index.html?" +
                QS.stringify({
                    modules: modules,
                    args: process.argv.slice(3),
                    isTTY: process.stdout.isTTY
                })
            ], {
                stdio: [
                    process.stdin,
                    process.stdout,
                    process.stderr
                ]
            });
            child.on("close", codeDeferred.resolve);
            return codeDeferred.promise;
        })
        .finally(server.stop);

    })
    .done(process.exit);
}

