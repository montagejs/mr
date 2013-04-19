var COVERAGE = !!process.env["npm_config_coverage"];

var PATH = require("path");
var spawn = require("child_process").spawn;
var util = require("util");

var Q = require("q");
var wd = require("wd");
var joey = require("joey");
var Apps = require("q-io/http-apps");

if (COVERAGE) {
    var IGNORE_RE = /spec|packages/;

    var FS = require("q-io/fs");
    var istanbul = require("istanbul");
    var instrumenter = new istanbul.Instrumenter();

    var fileTree = function (path) {
        return Apps.FileTree(path, {
            // use a custom file reader to instrument the code
            file: function (request, path, contentType, fs) {
                if (path.match(/.js$/) && !path.match(IGNORE_RE)) {
                    // instrument JS files
                    return FS.read(path, "r", "utf8").then(function (original) {
                        var response = Q.defer();
                        instrumenter.instrument(original, path, function (err, instrumented) {
                            if (err) {
                                response.reject(err);
                                return;
                            }

                            response.resolve({
                                status: 200,
                                headers: {
                                    "content-type": "application/javascript",
                                    "content-length": instrumented.length
                                },
                                body: [instrumented],
                                file: path
                            });
                        });
                        return response.promise;
                    });
                }

                // otherwise just serve the file
                return Apps.file(request, path, contentType, fs);
            }
        });
    };
} else {
    var fileTree = Apps.FileTree;
}

var POLL_TIME = 250;

var phantom = spawn("phantomjs", ["--webdriver=127.0.0.1:8910"], {
    stdio: "inherit"
});

var browser = wd.promiseRemote("127.0.0.1", 8910);

var server = joey
.error(true)
.app(fileTree(PATH.resolve(__dirname, "..")))
.server();

server.listen(0).done();

var testPagePort = server.node.address().port;
var testPageUrl = "http://127.0.0.1:" + testPagePort + "/spec/run.html";
console.log("Test page at " + testPageUrl);

// wait for Ghost Driver to start running
Q.delay(2000)
.then(function () {
    return browser.init();
})
.then(function () {
    return browser.get(testPageUrl);
})
.then(function () {
    var done = Q.defer();

    var poll = function() {
        browser.execute("return typeof jsApiReporter !== 'undefined' ? jsApiReporter.finished : false").then(function (isFinished) {
            if (isFinished) {
                done.resolve();
            } else {
                setTimeout(poll, POLL_TIME);
            }
        }, done.reject);
    };
    poll();

    return done.promise;
})
.then(function () {
    return browser.execute("return [jsApiReporter.suites(), jsApiReporter.results()]");
})
.spread(function (suites, results) {
    var failures = log(suites, results);
    console.log();

    if (failures.length) {
        console.log("\nFailures:\n");
        console.log(failures.join("\n\n"));
        console.log("\n");

        throw failures.length + " failures";
    }
})
.then(function () {
    if (!COVERAGE) {
        return;
    }

    return browser.execute("return window.__coverage__")
    .then(function (coverage) {
        var reporter = istanbul.Report.create("lcov");
        var collector = new istanbul.Collector();

        collector.add(coverage);

        console.log("Writing coverage reports.");
        reporter.writeReport(collector);
    });
})
.finally(function () {
    server.stop();
})
.finally(function () {
    return browser.quit();
})
.finally(function () {
    phantom.kill();
})
.done();

function log(suites, results, name, failures) {
    name = name || "";
    failures = failures || [];

    for (var i = 0, len = suites.length; i < len; i++) {
        var suite = suites[i];
        if (suite.type === "spec") {
            var result = results[suite.id];
            if (result.result === "passed") {
                util.print(".");
            } else {
                util.print("F");
                failures.push(
                    name + suite.name + "\n" +
                    result.messages.map(function (msg) {
                        return "\t" + msg.message;
                    }).join("\n")
                );
            }
        }

        if (suite.children.length) {
            log(suite.children, results, name + suite.name + " ", failures);
        }
    }

    return failures;
}

