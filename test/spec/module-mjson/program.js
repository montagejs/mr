var test = require('test');
var data = require("test.mjson");

test.assert(data.Hello === "World", 'parse string');
test.print('DONE', 'info');