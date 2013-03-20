var test = require("test");

var a = require("a/lib");
var b = require("b/lib");

test.expect(a.c).toBe("a's copy of c");
test.expect(b.c).toBe("b's copy of c");

test.print("DONE", "info");

