
module.exports = load;

var head = document.querySelector("head");
function load(location) {
    var script = document.createElement("script");
    script.src = location;
    script.onload = function () {
        script.parentNode.removeChild(script);
    };
    script.onerror = function (error) {
        script.parentNode.removeChild(script);
    };
    script.defer = true;
    head.appendChild(script);
}

