
var test = require('test');
var MyWeakMap = require('./weak-map').WeakMap;
test.assert(MyWeakMap === 2, 'should load ./weak-map.js');

var WeakMap = require('weak-map').WeakMap;
test.assert(WeakMap === 1, 'should load weak-map from node_module');
