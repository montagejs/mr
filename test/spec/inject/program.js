var test = require("test");
require.inject("dependency", {
	foo: true
});
module.exports = require.async("dependency")
.then(function (value) {
    test.assert(value.foo === true, "the injected dependency should export true");
    test.print("DONE", "info");
});
