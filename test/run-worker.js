/*global self */

global.isReadyPromise.then(function (options) {
    var client = options.client,
        jasmineEnv = global.jasmine.getEnv(),
        queryParameters = options.parameters,
        specString = queryParameters && queryParameters.spec || "",
        filterString = specString.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&'),
        filterPattern = new RegExp(filterString);

    jasmineEnv.specFilter = function (spec) {
        return filterPattern.test(spec.getFullName());
    };

    // Exit early if we don't get the client.
    // Eg, if it closed.
    self.didRunTestSuite = function (error) {
        if (error) {
            client.postMessage("Tests failed to run with error :" + error.message);
        } else {
            client.postMessage("Tests complete");
        }
        global.isMrSuiteDone = true;
    };

    require.async("./all.js");
});
