
var boot = require("./browser");
var preload = require("./preload");
var getParams = require("./script-params");

module.exports = function bootstrapPreload(plan) {
    var params = getParams();
    return boot(preload(plan, params), params);
};

