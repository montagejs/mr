var PATH = require("path");
var Require = require("../bootstrap-node");

require("./lib/jasmine-promise");

// Use async spec to cause Jasmine to wait until the real specs have been loaded
describe("Mr on node", function () {
    it("loads", function () {
        return Require.loadPackage(PATH.join(__dirname, ".."))
        .then(function (mr) {
            return mr.async("spec/require-spec");
        })
        .thenReturn();
    });
});
