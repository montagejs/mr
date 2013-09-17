#!/usr/bin/env node

var optimist = require("optimist");
var build = require("../build");

var argv = optimist
    .default("execute", "")
    .alias("e", "execute")
    .alias("h", "help")
    .argv;

function usage() {
    console.log("Usage: mrs <entry> [-e <expression>]");
    console.log("");
    console.log("   Creates a <script> from CommonJS modules");
    process.exit(-1);
}

if (argv.help) {
    usage();
}
if (argv._.length !== 1) {
    usage();
}

var path = argv._[0];
build(path)
.then(function (bundle) {
    console.log(bundle + argv.execute);
}).done();

