
var test = require('test');

var WeakMap = require('sub-module').WeakMap;
test.assert(WeakMap === 2, 'should load ./weak-map.js from node_module');

var WeakMap = require('sub-module/weak-map').WeakMap;
test.assert(WeakMap === 1, 'should load weak-map from node_module');
