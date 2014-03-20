
var Q = require("q");
var FS = require("fs");
var Path = require("path");
var Require = require("./require");

var template = FS.readFileSync(Path.join(__dirname, "boot/boilerplate.js"), "utf-8").trim();

module.exports = build;
function build(path) {
    return Require.findPackageLocationAndModuleId(path)
    .then(function (arg) {
        var cache = {};
        return Q.try(function () {
            return Require.loadPackage(arg.location, {
                overlays: ["node"],
                cache: cache,
                production: false
            });
        })
        .then(function (preprocessorPackage) {
            return Require.loadPackage(arg.location, {
                overlays: ["browser"],
                cache: cache,
                production: true,
                preprocessorPackage: preprocessorPackage
            });
        })
        .then(function (package) {
            return package.deepLoad(arg.id)
            .thenResolve(package);
        });
    })
    .then(function (package) {

        var bundle = [];
        var packages = package.packages;

        // Ensure that the entry point comes first in the bundle
        for (var location in packages) {
            if (Object.prototype.hasOwnProperty.call(packages, location)) {
                package = packages[location];
                var modules = package.modules;
                for (var id in modules) {
                    if (Object.prototype.hasOwnProperty.call(modules, id)) {
                        var module = modules[id];
                        if (module.text !== undefined) {
                            bundle.push(module);
                            module.bundled = true;
                            break;
                        }
                    }
                }
                break;
            }
        }

        // Otherwise, ensure that the modules are in lexicographic order to
        // ensure that each build from the same sources is consistent.
        Object.keys(packages).sort(function (a, b) {
            a = packages[a].config.name || a;
            b = packages[b].config.name || b;
            return a === b ? 0 : a < b ? -1 : 1;
        }).forEach(function (location) {
            var package = packages[location];
            var modules = package.modules;
            Object.keys(modules).sort().forEach(function (id) {
                var module = modules[id];
                if (module.error) {
                    throw module.error;
                }
                if (module.text !== undefined && !module.bundled) {
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
                JSON.stringify(module.require.config.name) + "," +
                JSON.stringify(module.id) + "," +
                JSON.stringify(dependencies) + "," +
                "function (require, exports, module){\n" + text + "}" +
            "]";
        }).join(",") + "]";

        return template + "((function (global){return" + payload + "})(this))";
    });
}

