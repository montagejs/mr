var test = require('test');

var foo = require('foo');
var bar = require('bar');
test.assert(foo === 1);
test.assert(bar === 2);
test.print('DONE', 'info');
