/* global process, module */
module.exports = function(grunt) {
    grunt.initConfig({
        pkg: grunt.file.readJSON("package.json"),
        connect: {
            server: {
                options: {
                    base: '.',
                    port: 9999
                }
            }
        },
        "saucelabs-jasmine": {
            all: {
                username: process.env.SAUCE_USERNAME,
                key: process.env.SAUCE_ACCESS_KEY,
                options: {
                    urls: ['http://127.0.0.1:9999/spec/run.html'],
                    tunnelTimeout: 5,
                    build: process.env.TRAVIS_JOB_ID,
                    concurrency: 3,
                    browsers: [ {
                        browserName: 'internet explorer',
                        platform: 'Windows 8',
                        version: '10'
                    }, {
                        browserName: 'chrome',
                        platform: 'linux'
                    }, {
                        browserName: 'opera',
                        platform: 'Windows 7',
                        version: '12'
                    }, {
                        browserName: 'safari',
                        platform: 'OS X 10.8',
                        version: '6'
                    }],
                    testname: "Mr specs"
                }
            }
        }
    });

    grunt.loadNpmTasks('grunt-contrib-connect');
    grunt.loadNpmTasks('grunt-saucelabs');

    // Encrypted keys on Travis are not available for pull request builds
    var saucelabsTask = [];
    if (process.env.SAUCE_USERNAME) {
        saucelabsTask = ["connect", "saucelabs-jasmine"];
    }

    grunt.registerTask("saucelabs", saucelabsTask);

};
