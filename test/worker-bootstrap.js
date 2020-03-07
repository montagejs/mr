/*global importScripts, self, Promise, jasmineRequire */

/********
 *
 * The application is required to register the service
 * worker so it can be registered at the correct scope.
 *
 * The worker cannot be registered from the library i.e.
 *         node_modules/montage/montage-worker.js
 */

 //TODO Although the worker must reside in the application,
 // the code to register and manager the worker could be
 // moved to montage
 var PATH_TO_MR = "../";
 var MAIN_MODULE = "/run-worker.js";
 importScripts("../node_modules/jasmine-core/lib/jasmine-core/jasmine.js");
 importScripts("jasmine-console-reporter.js");

 var isActivated = false, options;
 self.addEventListener("message", function (event) {
    var string = event.data,
        data, name;
    try {
        data = JSON.parse(string);
        name = data.name; //Included so other messages can be added in the future.
        options = data.options;
    } catch (e) {
        options = {parameters: {}};
    }
    options.client = event.source;
    resolveIsReadyPromise();
});



 self.isReadyPromise = new Promise(function (resolve, reject) {
    self.isReadyDeferred = {
        resolve: resolve,
        reject: reject
    };
 });

function resolveIsReadyPromise() {
    if (global.isMrSuiteDone) {
        options.client.postMessage("Specs were already run. Running them again requires deleting and reinstalling the worker");
    } else if (options && isActivated) {
        self.isReadyDeferred.resolve(options);
    }
}
self.addEventListener("activate", function () {
    isActivated = true;
    self.clients.claim().then(function () {
        resolveIsReadyPromise();
    });
});


 var jasmine = jasmineRequire.core(jasmineRequire),
     jasmineEnv = jasmine.getEnv(),
     jasmineInterface = jasmineRequire.interface(jasmine, jasmineEnv),
     JasmineConsoleReporter = jasmineRequire.ConsoleReporter();

self.jasmine = jasmine;
self.jasmineRequire = jasmineRequire;
for (var property in jasmineInterface) {
    if (jasmineInterface.hasOwnProperty(property)) {
        self[property] = jasmineInterface[property];
    }
}

jasmineEnv.addReporter(jasmineInterface.jsApiReporter);
jasmineEnv.addReporter(new JasmineConsoleReporter({
    colors: 1,
    cleanStack: 1,
    verbosity: 4,
    listStyle: 'indent',
    activity: false,
    print: console.log
}));

 importScripts("../bootstrap.js");



