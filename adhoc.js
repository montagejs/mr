/* global URL:true */

var URL = require("mini-url");

var TRIM_REG = /\+/g;
function decodeHash(s) { 
    return decodeURIComponent(s.replace(TRIM_REG, " ")); 
}

var PARSE_PARAM_REG = /([^&;=]+)=?([^&;]*)/g;
function getQueryParams() {

    var matches,
        hashParams = {},
        hashValue = location.search.toString().substr(1);

    while ((matches = PARSE_PARAM_REG.exec(hashValue))) {
       hashParams[decodeHash(matches[1])] = decodeHash(matches[2]);
    }

    return hashParams;
}


var packageLocation;
var moduleId;

if (window.location.search) {
    var query = getQueryParams();
    var packageLocation = query['package-location'];
    var moduleId = query['module-id'];
    document.querySelector("[name=package-location]").value = packageLocation;
    document.querySelector("[name=module-id]").value = moduleId;
    run(packageLocation, moduleId);
}

function run(packageLocation, moduleId) {
    packageLocation = URL.resolve(window.location, packageLocation);
    moduleId = moduleId || "";

    console.log("Require:", "package:", JSON.stringify(packageLocation), "id:", JSON.stringify(moduleId));
    require.loadPackage(packageLocation)
    .then(function (pkg) {
        return pkg.async(moduleId);
    })
    .then(function (exports) {
        console.log("Exports:", exports);
        console.log("Packages:", require.packages);
    });
}
