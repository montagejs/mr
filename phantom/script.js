
var system = require("system");
var Page = require("webpage");
var page = Page.create();

page.onConsoleMessage = function (message) {
    system.stdout.writeLine(message);
};

page.onAlert = function (message) {
    var code = parseInt(message, 10);
    if (code === code) { // !NaN
        phantom.exit(code);
    }
};

page.onError = function (message, trace) {
    system.stderr.writeLine(message);
    trace.forEach(function (frame) {
        system.stderr.writeLine(frame.file + ":" + frame.line, frame.function);
    });
    phantom.exit(-1);
};

page.onResourceError = function (resourceError) {
    system.stderr.writeLine("Resource error: " + resourceError.url);
    phantom.exit(-1);
};

page.open(system.args[1], function (status) {
    if (status !== "success") {
        system.stderr.writeLine("Can't load " + system.args[1]);
        phantom.exit(-1);
    }
});

