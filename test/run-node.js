/* global __dirname */
var jasmineRequire = require('jasmine-core/lib/jasmine-core/jasmine.js');
var JasmineConsoleReporter = require('jasmine-console-reporter');

// Init
var jasmine = jasmineRequire.core(jasmineRequire);
var jasmineEnv = jasmine.getEnv();
	
// Export interface
var jasmineInterface = jasmineRequire.interface(jasmine, jasmineEnv);
global.jasmine = jasmine;
global.jasmineRequire = jasmineRequire;
for (var property in jasmineInterface) {
	if (jasmineInterface.hasOwnProperty(property)) {
		global[property] = jasmineInterface[property];	
	}
}	

// Default reporter
jasmineEnv.addReporter(jasmineInterface.jsApiReporter);

// Html reporter
var consoleReporter = new JasmineConsoleReporter({
    colors: 1,         
    cleanStack: 1,      
    verbosity: 4,        
    listStyle: 'indent', 
    activity: false
});
jasmineEnv.addReporter(consoleReporter);

// Execute
var mrRequire = require('../bootstrap-node');
var PATH = require("path");

mrRequire.loadPackage(PATH.join(__dirname, ".")).then(function (mr) {
    return mr.async("all");
}).thenReturn();

