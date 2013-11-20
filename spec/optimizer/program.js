
var test = require("test");
var hello = require("./hello");
if (require.config.production) {
    test.assert(hello === 'hello, world!\n');
} else {
    test.assert(hello === 'Hello, World!\n');
}
test.print("DONE", "info");

