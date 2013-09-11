var test = require('test');

debugger;
test.assert(require('dot-slash') === 10, 'main with "./"');
test.assert(require('js-ext') === 20, 'main with ".js" extension');
test.assert(require('no-ext') === 30, 'main with no extension');

test.print('DONE', 'info');
