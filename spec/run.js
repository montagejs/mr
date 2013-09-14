
require("./require-spec");

var jasmineEnv = jasmine.getEnv();
jasmineEnv.updateInterval = 1000;

var htmlReporter = new jasmine.HtmlReporter();
// for phantom.js
this.jsApiReporter = new jasmine.JsApiReporter();
// for Saucelabs
var jsReporter = new jasmine.JSReporter();

jasmineEnv.addReporter(htmlReporter);
jasmineEnv.addReporter(this.jsApiReporter);
jasmineEnv.addReporter(jsReporter);

jasmineEnv.specFilter = function(spec) {
    return htmlReporter.specFilter(spec);
};

var currentWindowOnload = window.onload;

if (currentWindowOnload) {
    currentWindowOnload();
}
execJasmine();

function execJasmine() {
    jasmineEnv.execute();
}

