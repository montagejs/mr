
// Resolves CommonJS module IDs (not paths)
exports.resolve = resolve;
function resolve(id, baseId) {
    id = String(id);
    var source = id.split("/");
    var target = [];
    if (source.length && source[0] === "." || source[0] === "..") {
        var parts = baseId.split("/");
        parts.pop();
        source.unshift.apply(source, parts);
    }
    for (var i = 0, ii = source.length; i < ii; i++) {
        /*jshint -W035 */
        var part = source[i];
        if (part === "" || part === ".") {
        } else if (part === "..") {
            if (target.length) {
                target.pop();
            }
        } else {
            target.push(part);
        }
        /*jshint +W035 */
    }
    return target.join("/");
}

exports.normalize = normalize;
function normalize(id) {
    var match = /^(.*)\.js$/.exec(id);
    if (match) {
        id = match[1];
    }
    return id;
}

exports.extension = extension;
function extension(location) {
    var match = /\.([^\/\.]+)$/.exec(location);
    if (match) {
        return match[1];
    }
}

