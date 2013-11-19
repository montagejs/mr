
var URL = require("url");

module.exports = getParams;
function getParams(scriptName) {
    var i, j,
        match,
        script,
        location,
        attr,
        name,
        re = new RegExp("^(.*)" + scriptName + "(?:[\\?\\.]|$)", "i");
    var params = {};
    // Find the <script> that loads us, so we can divine our parameters
    // from its attributes.
    var scripts = document.getElementsByTagName("script");
    for (i = 0; i < scripts.length; i++) {
        script = scripts[i];
        // There are two distinct ways that a bootstrapping script might be
        // identified.  In development, we can rely on the script name.  In
        // production, the script name is produced by the optimizer and does
        // not have a generic pattern.  However, the optimizer will drop a
        // `data-boot-location` property on the script instead.  This will also
        // serve to inform the boot script of the location of the loading
        // package, albeit Montage or Mr.
        if (scriptName && script.src && (match = script.src.match(re))) {
            location = match[1];
        }
        if (script.hasAttribute("data-boot-location")) {
            location = URL.resolve(window.location, script.getAttribute("data-boot-location"));
        }
        if (location) {
            if (script.dataset) {
                for (name in script.dataset) {
                    if (script.dataset.hasOwnProperty(name)) {
                        params[name] = script.dataset[name];
                    }
                }
            } else if (script.attributes) {
                var dataRe = /^data-(.*)$/,
                    letterAfterDash = /-([a-z])/g,
                    /*jshint -W083 */
                    upperCaseChar = function (_, c) {
                        return c.toUpperCase();
                    };
                    /*jshint +W083 */

                for (j = 0; j < script.attributes.length; j++) {
                    attr = script.attributes[j];
                    match = attr.name.match(/^data-(.*)$/);
                    if (match) {
                        params[match[1].replace(letterAfterDash, upperCaseChar)] = attr.value;
                    }
                }
            }
            // Permits multiple boot <scripts>; by removing as they are
            // discovered, next one finds itself.
            script.parentNode.removeChild(script);
            params.location = location;
            break;
        }
    }
    return params;
}

