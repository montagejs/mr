var PATH = require("path");
var spawn = require("child_process").spawn;
var util = require("util");

var Q = require("q");
var wd = require("wd");
var joey = require("joey");

var TESTS_FAILED = {};
var POLL_TIME = 250;

var phantom = spawn("phantomjs", ["--webdriver=127.0.0.1:8910"], {
    stdio: "inherit"
});

var browser = wd.promiseRemote("127.0.0.1", 8910);

var server = joey
.error()
.fileTree(PATH.resolve(__dirname, ".."))
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
    var info = log(suites, results);

    if (info.failures.length) {
        console.log("\nFailures:\n");
        console.log(info.failures.join("\n\n"));
    }

    var msg = '';
        msg += info.specsCount + ' test' + ((info.specsCount === 1) ? '' : 's') + ', ';
        msg += info.totalCount + ' assertion' + ((info.totalCount === 1) ? '' : 's') + ', ';
        msg += info.failedCount + ' failure' + ((info.failedCount === 1) ? '' : 's');

    console.log();
    console.log(msg);

    if (info.failures.length) {
        throw TESTS_FAILED;
    }
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
.fail(function (err) {
    if (err === TESTS_FAILED) {
        process.exit(1);
    }
    throw err;
})
.done();

function log(suites, results, name, info) {
    name = name || "";
    info = info || {specsCount: 0, totalCount: 0, failedCount: 0, failures: []};

    for (var i = 0, len = suites.length; i < len; i++) {
        var suite = suites[i];
        if (suite.type === "spec") {
            var result = results[suite.id];

            info.specsCount++;
            info.totalCount += result.messages.length;
            if (result.result === "passed") {
                util.print(".");
            } else {
                util.print("F");
                var msg = suite.name + "\n";
                for (var j = 0; j < result.messages.length; j++) {
                    var message = result.messages[j];
                    if (message.passed_) continue;
                    info.failedCount++;
                    msg += "\t" + message.message + "\n";
                }
                info.failures.push(msg);
            }
        }

        if (suite.children.length) {
            log(suite.children, results, name + suite.name + " ", info);
        }
    }

    return info;
}

