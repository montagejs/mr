var test = require('test');
var URL = require('url');
var parsed = URL.parse('https://examples.org/mr');
test.assert(parsed.path === '/mr', 'child module identifier');
test.print('DONE', 'info');
