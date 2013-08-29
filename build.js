
var FS = require("fs");
var Path = require("path");
var Require = require("./node");

var template = FS.readFileSync(Path.join(__dirname, "boot/boilerplate.js"), "utf-8").trim();

module.exports = build;
function build(path) {
    return Require.findPackageLocationAndModuleId(path)
    .then(function (arg) {
        return Require.loadPackage(arg.location, {
            overlays: ["browser"]
        })
        .then(function (package) {
            return package.deepLoad(arg.id)
            .thenResolve(package)
        })
    })
    .then(function (package) {
        var bundle = [];
        var packages = package.packages;
        Object.keys(packages).forEach(function (location) {
            var package = packages[location];
            var modules = package.modules;
            Object.keys(modules).forEach(function (id) {
                var module = modules[id];
                if (module.error) {
                    throw module.error;
                }
                if (module.text !== undefined) {
                    bundle.push(module);
                }
            });
        });

        // number the bundled modules
        var index = 0;
        bundle.forEach(function (module) {
            module.index = index++;
        });

        var payload = "[" + bundle.map(function (module) {
            var dependencies = {};
            module.dependencies.forEach(function (dependencyId) {
                var dependency = module.require.lookup(dependencyId, module.id);
                dependencies[dependencyId] = dependency.index;
            });
            var title = module.require.config.name + " " + module.id;
            var lead = "\n// ";
            var rule = Array(title.length + 1).join("-");
            var heading = lead + title + lead + rule + "\n\n";
            var text = heading + module.text;
            return "[" +
                JSON.stringify(dependencies) + "," +
                "function (require, exports, module){\n" + text + "}" +
            "]";
        }).join(",") + "]";

        return template + "((function (global){return" + payload + "})(this))";
    })
}

