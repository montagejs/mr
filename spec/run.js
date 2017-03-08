require("./require-spec");

var jasmineEnv = jasmine.getEnv();
jasmineEnv.updateInterval = 1000;

var htmlReporter = new jasmine.HtmlReporter();
var jsApiReporter = new jasmine.JsApiReporter();

window.jsApiReporter = jsApiReporter;

jasmineEnv.addReporter(htmlReporter);
jasmineEnv.addReporter(jsApiReporter);

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

