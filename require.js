/*
 * Based in part on Motorola Mobility’s Montage
 * Copyright (c) 2012, Motorola Mobility LLC. All Rights Reserved.
 * 3-Clause BSD License
 * https://github.com/motorola-mobility/montage/blob/master/LICENSE.md
 */
/*global -URL */
/*jshint node:true */

// This is the Node.js implementation for "mr".
// For browsers, this module identifier is redirected to browser.js by
// package.json.

var Require = require("./common");
var Q = require("q");
var FS = require("fs");
var URL = require("url");
var Path = require("path");

var globalEval = eval;

module.exports = Require;

Require.overlays = ["node"];

Require.getLocation = function getLocation() {
    return URL.resolve("file:///", process.cwd() + "/");
};

Require.locationToPath = function locationToPath(location) {
    var parsed = URL.parse(location);
    return parsed.path;
};

Require.filePathToLocation = function filePathToLocation(path) {
    return URL.resolve(Require.getLocation(), path);
};

Require.directoryPathToLocation = function directoryPathToLocation(path) {
    if (!/\/$/.test(path)) {
        path += "/";
    }
    path = Require.filePathToLocation(path);
    return path;
};

Require.read = function read(location) {
    var deferred = Q.defer();
    var path = Require.locationToPath(location);
    FS.readFile(path, "utf-8", function (error, text) {
        if (error) {
            deferred.reject(new Error(error));
        } else {
            deferred.resolve(text);
        }
    });
    return deferred.promise;
};

// Compiles module text into a function.
// Can be overriden by the platform to make the engine aware of the source path. Uses sourceURL hack by default.
Require.Compiler = function Compiler(config) {
    config.scope = config.scope || {};
    var names = ["require", "exports", "module", "__filename", "__dirname"];
    var scopeNames = Object.keys(config.scope);
    names.push.apply(names, scopeNames);
    return function (module) {
        if (module.factory) {
            return module;
        } else if (
            module.text !== void 0 &&
            module.type === "js"
        ) {
            var factory = globalEval(
                "(function(" + names.join(",") + "){" +
                module.text +
                "\n//*/\n})\n//@ sourceURL=" + module.location
            );
            module.factory = function (require, exports, module) {
                Array.prototype.push.apply(arguments, scopeNames.map(function (name) {
                    return config.scope[name];
                }));
                return factory.apply(this, arguments);
            };
            // new Function will have its body reevaluated at every call, hence using eval instead
            // https://developer.mozilla.org/en/JavaScript/Reference/Functions_and_function_scope
            //module.factory = new Function("require", "exports", "module", module.text + "\n//*/\n//@ sourceURL="+module.path);
        }
    };
};

Require.Loader = function Loader(config, load) {
    return function (location, module) {
        return config.read(location)
        .then(function (text) {
            module.text = text;
            module.location = location;
        }, function (error) {
            return load(location, module, error);
        });
    };
};

Require.NodeLoader = function NodeLoader(config, load) {
    config.overlays = config.overlays || Require.overlays;
    if (config.overlays.indexOf("node") >= 0) {
        return function nodeLoad(location, module, lastError) {
            try {
                module.exports = require(module.id);
                module.type = void 0;
            } catch (error) {
                error.message += " and " + lastError.message;
                module.error = error;
            }
        };
    } else {
        return function cantLoad(location, module, error) {
            throw new Error(
                "Can't load " + JSON.stringify(location) +
                " from package " + JSON.stringify(config.name) +
                " at " + JSON.stringify(config.location) +
                (error ?  " because " + error.message : "")
            );
        };
    }
};

Require.makeLoader = function makeLoader(config) {
    return Require.CommonLoader(
        config,
        Require.Loader(
            config,
            Require.NodeLoader(config)
        )
    );
};

Require.findPackagePath = function findPackagePath(directory) {
    if (directory === Path.dirname(directory)) {
        return Q.reject(new Error("Can't find package"));
    }
    var packageJson = Path.join(directory, "package.json");
    return Q.ninvoke(FS, "stat", packageJson)
    .then(function (stat) {
        return stat.isFile();
    }, function (error) {
        return false;
    }).then(function (isFile) {
        if (isFile) {
            return directory;
        } else {
            return Require.findPackagePath(Path.dirname(directory));
        }
    });
};

Require.findPackageLocationAndModuleId = function findPackageLocationAndModuleId(path) {
    path = Path.resolve(process.cwd(), path);
    var directory = Path.dirname(path);
    return Require.findPackagePath(directory)
    .then(function (packageDirectory) {
        var modulePath = Path.relative(packageDirectory, path);
        modulePath = modulePath.replace(/\.js$/, "");
        return {
            location: Require.directoryPathToLocation(packageDirectory),
            id: modulePath
        };
    }, function (error) {
        throw new Error("Can't find package: " + path);
    });
};

