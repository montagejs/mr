
var Q = require("q");
var URL = require("url");
var QS = require("qs");
var Require = require("../require");
require("./console");

var location = URL.resolve(window.location, "/");
var query = QS.parse(window.location.search.slice(1));
global.isTTY = !!query.isTTY;

Require.loadPackage(location, {
    overlays: ["browser"]
})
.then(function (package) {
    var loaded = Q();
    var executed = Q();
    query.modules.forEach(function (moduleId) {
        loaded = loaded.then(function () {
            return package.deepLoad(moduleId);
        });
        executed = loaded.then(function () {
            var module = package.getModuleDescriptor(moduleId);
            module.args = query.args;
            return package(moduleId);
        });
    });
    return executed;
})
.done(function () {
    alert(0);
});

