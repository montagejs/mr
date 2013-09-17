
var boot = require("./browser");
var preload = require("./preload");

module.exports = function bootstrapPreload(plan) {
    return boot(preload(plan));
};

