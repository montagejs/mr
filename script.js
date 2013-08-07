
module.exports = load;

var head = document.querySelector("head");
function load(location) {
    var script = document.createElement("script");
    script.src = location;
    script.onload = function () {
        // remove clutter
        script.parentNode.removeChild(script);
    };
    head.appendChild(script);
};

