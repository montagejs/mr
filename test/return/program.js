var test = require("test");
test.assert(require("returns") === 10, 'module return value should replace exports');
test.print('DONE', 'info');
