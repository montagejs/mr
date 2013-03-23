var test = require("test");
var Q = require("q");

var sandbox = require("mr/sandbox");

var a = require("./a");
var dep = require("dependency/main");

return Q.all([
    sandbox(require, "./a", {
        "./b": "mocked"
    }),
    sandbox(require, "dependency/main", {
        "other": "mocked"
    }),
])
.spread(function (sandboxedA, sandboxedDep) {
    var a2 = require("./a");
    var dep2 = require("dependency/main");

    test.assert(a.value === "original", "a.b is the original");
    test.assert(sandboxedA.value === "mocked", "sandboxedA.b is the mock");
    test.assert(a2.value === "original", "a2.b is the original");

    test.assert(dep === "other", "dep is the original");
    test.assert(sandboxedDep === "mocked", "sandboxedDep is the mock");
    test.assert(dep2 === "other", "dep2 is the original");
}).then(function () {
    test.print('DONE', 'info');
});
