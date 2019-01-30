global = this;

(function (modules) {

    // Bundle allows the run-time to extract already-loaded modules from the
    // boot bundle.
    var bundle = {};

    // Unpack module tuples into module objects.
    for (var i = 0; i < modules.length; i++) {
        var module = modules[i];
        modules[i] = new Module(module[0], module[1], module[2], module[3]);
        bundle[module[0]] = bundle[module[1]] || {};
        bundle[module[0]][module[1]] = module;
    }

    function Module(name, id, map, factory) {
        // Package name and module identifier are purely informative.
        this.name = name;
        this.id = id;
        // Dependency map and factory are used to instantiate bundled modules.
        this.map = map;
        this.factory = factory;
    }

    Module.prototype.getExports = function () {
        var module = this;
        if (module.exports === void 0) {
            module.exports = {};
            var require = function (id) {
                var index = module.map[id];
                var dependency = modules[index];
                if (!dependency)
                    throw new Error("Bundle is missing a dependency: " + id);
                return dependency.getExports();
            }
            module.exports = module.factory(require, module.exports, module) || module.exports;
        }
        return module.exports;
    };

    // Communicate the bundle to all bundled modules
    Module.prototype.bundle = bundle;

    return modules[0].getExports();
})
