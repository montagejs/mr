
module.exports = merge;
function merge(target, source) {
    for (var name in source) {
        if (has.call(source, name)) {
            var sourceValue = source[name];
            var targetValue = target[name];
            if (sourceValue === null) {
                delete target[name];
            } else if (
                typeof sourceValue === "object" && !Array.isArray(sourceValue) &&
                typeof targetValue === "object" && !Array.isArray(targetValue)
            ) {
                merge(targetValue, sourceValue);
            } else {
                target[name] = source[name];
            }
        }
    }
}

var has = Object.prototype.hasOwnProperty;

