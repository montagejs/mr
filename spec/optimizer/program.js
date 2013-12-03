var test = require("test");
var hello = require("./hello");
test.assert(false === !!require.config.preprocessorPackage);
test.print("DONE", "info");
