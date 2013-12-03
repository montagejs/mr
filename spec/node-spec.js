
require("./lib/jasmine-promise");
var URL = require("url");
var Require = require("../node");

// Use async spec to cause Jasmine to wait until the real specs have been loaded
describe("Mr on node", function () {
    it("must test on node", function () {
        expect(typeof window).toBe("undefined");
    });
    it("loads", function () {
        var location = Require.directoryPathToLocation(__dirname);
        location = URL.resolve(location, "../");
        return Require.loadPackage(location)
        .then(function (mr) {
            return mr.async("spec/require-spec");
        })
        .thenResolve();
    });
});
