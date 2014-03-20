
require("colors");
var Util = require("util");

function logger(method, color) {
    return function () {
        var args = [];
        var index = 0;
        if (arguments.length > 0 && typeof arguments[0] === "string") {
            if (global.isTTY && color) {
                args[0] = arguments[0][color];
            } else {
                args[0] = arguments[0];
            }
            index = 1;
        }
        for (; index < arguments.length; index++) {
            args[index] = Util.inspect(
                arguments[index], {
                    colors: global.isTTY
                }
            );
        }
        method.apply(console, args);
    };
}

console.log = logger(console.log, null);
console.error = logger(console.error, "red");
console.warn = logger(console.error, "yellow");

