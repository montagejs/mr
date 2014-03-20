var test = require("test");
var hello = require("./hello");
test.assert(false === Boolean(require.config.preprocessorPackage));
test.print("DONE", "info");
