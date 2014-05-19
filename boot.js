global = this;

(function (modules) {

    // Bundle allows the run-time to extract already-loaded modules from the
    // boot bundle.
    var bundle = {};

    // Unpack module tuples into module objects.
    for (var i = 0; i < modules.length; i++) {
        var module = modules[i];
        modules[i] = new Module(module[0], module[1], module[2], module[3]);
        bundle[module[0]] = bundle[module[1]] || {};
        bundle[module[0]][module[1]] = module;
    }

    function Module(name, id, map, factory) {
        // Package name and module identifier are purely informative.
        this.name = name;
        this.id = id;
        // Dependency map and factory are used to instantiate bundled modules.
        this.map = map;
        this.factory = factory;
    }

    Module.prototype.getExports = function () {
        var module = this;
        if (module.exports === void 0) {
            module.exports = {};
            var require = function (id) {
                var index = module.map[id];
                var dependency = modules[index];
                if (!dependency)
                    throw new Error("Bundle is missing a dependency: " + id);
                return dependency.getExports();
            }
            module.exports = module.factory(require, module.exports, module) || module.exports;
        }
        return module.exports;
    };

    // Communicate the bundle to all bundled modules
    Module.prototype.bundle = bundle;

    return modules[0].getExports();
})((function (global){return[["mr","boot/require",{"../require":12,"url":14,"q":16,"./script-params":11},function (require, exports, module){

// mr boot/require
// ---------------

"use strict";

var Require = require("../require");
var URL = require("url");
var Q = require("q");
var getParams = require("./script-params");

module.exports = boot;
function boot(preloaded, params) {
    params = params || getParams("boot.js");

    var config = {preloaded: preloaded};
    var applicationLocation = URL.resolve(window.location, params.package || ".");
    var moduleId = params.module || "";

    if ("autoPackage" in params) {
        Require.injectPackageDescription(applicationLocation, {});
    }

    return Require.loadPackage({
        location: applicationLocation,
        hash: params.applicationHash
    }, {
        bundle: module.bundle
    })
    .then(function (applicationRequire) {
        return applicationRequire.loadPackage({
            name: "mr",
            location: params.mrLocation,
            hash: params.mrHash
        })
        .then(function (mrRequire) {
            return mrRequire.loadPackage({
                name: "q",
                location: params.qLocation,
                hash: params.qHash
            })
            .then(function (qRequire) {
                qRequire.inject("q", Q);
                mrRequire.inject("mini-url", URL);
                mrRequire.inject("require", Require);
                return applicationRequire.async(moduleId);
            });
        });
    });

}

}],["asap","asap",{"./queue":2},function (require, exports, module){

// asap asap
// ---------

"use strict";

// Use the fastest possible means to execute a task in a future turn
// of the event loop.

// Queue is a circular buffer with good locality of reference and doesn't
// allocate new memory unless there are more than `InitialCapacity` parallel
// tasks in which case it will resize itself generously to x8 more capacity.
// The use case of asap should require no or few amount of resizes during
// runtime.
// Calling a task frees a slot immediately so if the calling
// has a side effect of queuing itself again, it can be sustained
// without additional memory
// Queue specifically uses
// http://en.wikipedia.org/wiki/Circular_buffer#Use_a_Fill_Count
// Because:
// 1. We need fast .length operation, since queue
//   could have changed after every iteration
// 2. Modulus can be negated by using power-of-two
//   capacities and replacing it with bitwise AND
// 3. It will not be used in a multi-threaded situation.

var Queue = require("./queue");

//1024 = InitialCapacity
var queue = new Queue(1024);
var flushing = false;
var requestFlush = void 0;
var hasSetImmediate = typeof setImmediate === "function";
var domain;

// Avoid shims from browserify.
// The existence of `global` in browsers is guaranteed by browserify.
var process = global.process;

// Note that some fake-Node environments,
// like the Mocha test runner, introduce a `process` global.
var isNodeJS = !!process && ({}).toString.call(process) === "[object process]";

function flush() {
    /* jshint loopfunc: true */

    while (queue.length > 0) {
        var task = queue.shift();

        try {
            task.call();

        } catch (e) {
            if (isNodeJS) {
                // In node, uncaught exceptions are considered fatal errors.
                // Re-throw them to interrupt flushing!

                // Ensure continuation if an uncaught exception is suppressed
                // listening process.on("uncaughtException") or domain("error").
                requestFlush();

                throw e;

            } else {
                // In browsers, uncaught exceptions are not fatal.
                // Re-throw them asynchronously to avoid slow-downs.
                setTimeout(function () {
                    throw e;
                }, 0);
            }
        }
    }

    flushing = false;
}

if (isNodeJS) {
    // Node.js
    requestFlush = function () {
        // Ensure flushing is not bound to any domain.
        var currentDomain = process.domain;
        if (currentDomain) {
            domain = domain || (1,require)("domain");
            domain.active = process.domain = null;
        }

        // Avoid tick recursion - use setImmediate if it exists.
        if (flushing && hasSetImmediate) {
            setImmediate(flush);
        } else {
            process.nextTick(flush);
        }

        if (currentDomain) {
            domain.active = process.domain = currentDomain;
        }
    };

} else if (hasSetImmediate) {
    // In IE10, or https://github.com/NobleJS/setImmediate
    requestFlush = function () {
        setImmediate(flush);
    };

} else if (typeof MessageChannel !== "undefined") {
    // modern browsers
    // http://www.nonblocking.io/2011/06/windownexttick.html
    var channel = new MessageChannel();
    // At least Safari Version 6.0.5 (8536.30.1) intermittently cannot create
    // working message ports the first time a page loads.
    channel.port1.onmessage = function () {
        requestFlush = requestPortFlush;
        channel.port1.onmessage = flush;
        flush();
    };
    var requestPortFlush = function () {
        // Opera requires us to provide a message payload, regardless of
        // whether we use it.
        channel.port2.postMessage(0);
    };
    requestFlush = function () {
        setTimeout(flush, 0);
        requestPortFlush();
    };

} else {
    // old browsers
    requestFlush = function () {
        setTimeout(flush, 0);
    };
}

function asap(task) {
    if (isNodeJS && process.domain) {
        task = process.domain.bind(task);
    }

    queue.push(task);

    if (!flushing) {
        requestFlush();
        flushing = true;
    }
};

module.exports = asap;

}],["asap","queue",{},function (require, exports, module){

// asap queue
// ----------

"use strict";

module.exports = Queue;
function Queue(capacity) {
    this.capacity = this.snap(capacity);
    this.length = 0;
    this.front = 0;
    this.initialize();
}

Queue.prototype.push = function (value) {
    var length = this.length;
    if (this.capacity <= length) {
        this.grow(this.snap(this.capacity * this.growFactor));
    }
    var index = (this.front + length) & (this.capacity - 1);
    this[index] = value;
    this.length = length + 1;
};

Queue.prototype.shift = function () {
    var front = this.front;
    var result = this[front];

    this[front] = void 0;
    this.front = (front + 1) & (this.capacity - 1);
    this.length--;
    return result;
};

Queue.prototype.grow = function (capacity) {
    var oldFront = this.front;
    var oldCapacity = this.capacity;
    var oldQueue = new Array(oldCapacity);
    var length = this.length;

    copy(this, 0, oldQueue, 0, oldCapacity);
    this.capacity = capacity;
    this.initialize();
    this.front = 0;
    if (oldFront + length <= oldCapacity) {
        // Can perform direct linear copy
        copy(oldQueue, oldFront, this, 0, length);
    } else {
        // Cannot perform copy directly, perform as much as possible at the
        // end, and then copy the rest to the beginning of the buffer
        var lengthBeforeWrapping =
            length - ((oldFront + length) & (oldCapacity - 1));
        copy(
            oldQueue,
            oldFront,
            this,
            0,
            lengthBeforeWrapping
        );
        copy(
            oldQueue,
            0,
            this,
            lengthBeforeWrapping,
            length - lengthBeforeWrapping
        );
    }
};

Queue.prototype.initialize = function () {
    var length = this.capacity;
    for (var i = 0; i < length; ++i) {
        this[i] = void 0;
    }
};

Queue.prototype.snap = function (capacity) {
    if (typeof capacity !== "number") {
        return this.minCapacity;
    }
    return pow2AtLeast(
        Math.min(this.maxCapacity, Math.max(this.minCapacity, capacity))
    );
};

Queue.prototype.maxCapacity = (1 << 30) | 0;
Queue.prototype.minCapacity = 16;
Queue.prototype.growFactor = 8;

function copy(source, sourceIndex, target, targetIndex, length) {
    for (var index = 0; index < length; ++index) {
        target[index + targetIndex] = source[index + sourceIndex];
    }
}

function pow2AtLeast(n) {
    n = n >>> 0;
    n = n - 1;
    n = n | (n >> 1);
    n = n | (n >> 2);
    n = n | (n >> 4);
    n = n | (n >> 8);
    n = n | (n >> 16);
    return n + 1;
}

}],["collections","generic-collection",{"./shim-array":7},function (require, exports, module){

// collections generic-collection
// ------------------------------

"use strict";

module.exports = GenericCollection;
function GenericCollection() {
    throw new Error("Can't construct. GenericCollection is a mixin.");
}

GenericCollection.prototype.addEach = function (values) {
    if (values && Object(values) === values) {
        if (typeof values.forEach === "function") {
            values.forEach(this.add, this);
        } else if (typeof values.length === "number") {
            // Array-like objects that do not implement forEach, ergo,
            // Arguments
            for (var i = 0; i < values.length; i++) {
                this.add(values[i], i);
            }
        } else {
            Object.keys(values).forEach(function (key) {
                this.add(values[key], key);
            }, this);
        }
    }
    return this;
};

// This is sufficiently generic for Map (since the value may be a key)
// and ordered collections (since it forwards the equals argument)
GenericCollection.prototype.deleteEach = function (values, equals) {
    values.forEach(function (value) {
        this["delete"](value, equals);
    }, this);
    return this;
};

// all of the following functions are implemented in terms of "reduce".
// some need "constructClone".

GenericCollection.prototype.forEach = function (callback /*, thisp*/) {
    var thisp = arguments[1];
    return this.reduce(function (undefined, value, key, object, depth) {
        callback.call(thisp, value, key, object, depth);
    }, undefined);
};

GenericCollection.prototype.map = function (callback /*, thisp*/) {
    var thisp = arguments[1];
    var result = [];
    this.reduce(function (undefined, value, key, object, depth) {
        result.push(callback.call(thisp, value, key, object, depth));
    }, undefined);
    return result;
};

GenericCollection.prototype.enumerate = function (start) {
    if (start == null) {
        start = 0;
    }
    var result = [];
    this.reduce(function (undefined, value) {
        result.push([start++, value]);
    }, undefined);
    return result;
};

GenericCollection.prototype.group = function (callback, thisp, equals) {
    equals = equals || Object.equals;
    var groups = [];
    var keys = [];
    this.forEach(function (value, key, object) {
        var key = callback.call(thisp, value, key, object);
        var index = keys.indexOf(key, equals);
        var group;
        if (index === -1) {
            group = [];
            groups.push([key, group]);
            keys.push(key);
        } else {
            group = groups[index][1];
        }
        group.push(value);
    });
    return groups;
};

GenericCollection.prototype.toArray = function () {
    return this.map(Function.identity);
};

// this depends on stringable keys, which apply to Array and Iterator
// because they have numeric keys and all Maps since they may use
// strings as keys.  List, Set, and SortedSet have nodes for keys, so
// toObject would not be meaningful.
GenericCollection.prototype.toObject = function () {
    var object = {};
    this.reduce(function (undefined, value, key) {
        object[key] = value;
    }, undefined);
    return object;
};

GenericCollection.prototype.filter = function (callback /*, thisp*/) {
    var thisp = arguments[1];
    var result = this.constructClone();
    this.reduce(function (undefined, value, key, object, depth) {
        if (callback.call(thisp, value, key, object, depth)) {
            result.add(value, key);
        }
    }, undefined);
    return result;
};

GenericCollection.prototype.every = function (callback /*, thisp*/) {
    var thisp = arguments[1];
    var iterator = this.iterate();
    while (true) {
        var iteration = iterator.next();
        if (iteration.done) {
            return true;
        } else if (!callback.call(thisp, iteration.value, iteration.index, this)) {
            return false;
        }
    }
};

GenericCollection.prototype.some = function (callback /*, thisp*/) {
    var thisp = arguments[1];
    var iterator = this.iterate();
    while (true) {
        var iteration = iterator.next();
        if (iteration.done) {
            return false;
        } else if (callback.call(thisp, iteration.value, iteration.index, this)) {
            return true;
        }
    }
};

GenericCollection.prototype.min = function (compare) {
    compare = compare || this.contentCompare || Object.compare;
    var first = true;
    return this.reduce(function (result, value) {
        if (first) {
            first = false;
            return value;
        } else {
            return compare(value, result) < 0 ? value : result;
        }
    }, undefined);
};

GenericCollection.prototype.max = function (compare) {
    compare = compare || this.contentCompare || Object.compare;
    var first = true;
    return this.reduce(function (result, value) {
        if (first) {
            first = false;
            return value;
        } else {
            return compare(value, result) > 0 ? value : result;
        }
    }, undefined);
};

GenericCollection.prototype.sum = function (zero) {
    zero = zero === undefined ? 0 : zero;
    return this.reduce(function (a, b) {
        return a + b;
    }, zero);
};

GenericCollection.prototype.average = function (zero) {
    var sum = zero === undefined ? 0 : zero;
    var count = zero === undefined ? 0 : zero;
    this.reduce(function (undefined, value) {
        sum += value;
        count += 1;
    }, undefined);
    return sum / count;
};

GenericCollection.prototype.concat = function () {
    var result = this.constructClone(this);
    for (var i = 0; i < arguments.length; i++) {
        result.addEach(arguments[i]);
    }
    return result;
};

GenericCollection.prototype.flatten = function () {
    var self = this;
    return this.reduce(function (result, array) {
        array.forEach(function (value) {
            this.push(value);
        }, result, self);
        return result;
    }, []);
};

GenericCollection.prototype.zip = function () {
    var table = Array.prototype.slice.call(arguments);
    table.unshift(this);
    return Array.unzip(table);
}

GenericCollection.prototype.join = function (delimiter) {
    return this.reduce(function (result, string) {
        return result + delimiter + string;
    });
};

GenericCollection.prototype.sorted = function (compare, by, order) {
    compare = compare || this.contentCompare || Object.compare;
    // account for comparators generated by Function.by
    if (compare.by) {
        by = compare.by;
        compare = compare.compare || this.contentCompare || Object.compare;
    } else {
        by = by || Function.identity;
    }
    if (order === undefined)
        order = 1;
    return this.map(function (item) {
        return {
            by: by(item),
            value: item
        };
    })
    .sort(function (a, b) {
        return compare(a.by, b.by) * order;
    })
    .map(function (pair) {
        return pair.value;
    });
};

GenericCollection.prototype.reversed = function () {
    return this.constructClone(this).reverse();
};

GenericCollection.prototype.clone = function (depth, memo) {
    if (depth === undefined) {
        depth = Infinity;
    } else if (depth === 0) {
        return this;
    }
    var clone = this.constructClone();
    this.forEach(function (value, key) {
        clone.add(Object.clone(value, depth - 1, memo), key);
    }, this);
    return clone;
};

GenericCollection.prototype.only = function () {
    if (this.length === 1) {
        return this.one();
    }
};

require("./shim-array");

}],["collections","generic-order",{"./shim-object":9},function (require, exports, module){

// collections generic-order
// -------------------------


var Object = require("./shim-object");

module.exports = GenericOrder;
function GenericOrder() {
    throw new Error("Can't construct. GenericOrder is a mixin.");
}

GenericOrder.prototype.equals = function (that, equals) {
    equals = equals || this.contentEquals || Object.equals;

    if (this === that) {
        return true;
    }
    if (!that) {
        return false;
    }

    var self = this;
    return (
        this.length === that.length &&
        this.zip(that).every(function (pair) {
            return equals(pair[0], pair[1]);
        })
    );
};

GenericOrder.prototype.compare = function (that, compare) {
    compare = compare || this.contentCompare || Object.compare;

    if (this === that) {
        return 0;
    }
    if (!that) {
        return 1;
    }

    var length = Math.min(this.length, that.length);
    var comparison = this.zip(that).reduce(function (comparison, pair, index) {
        if (comparison === 0) {
            if (index >= length) {
                return comparison;
            } else {
                return compare(pair[0], pair[1]);
            }
        } else {
            return comparison;
        }
    }, 0);
    if (comparison === 0) {
        return this.length - that.length;
    }
    return comparison;
};

}],["collections","iterator",{"./weak-map":17,"./generic-collection":3},function (require, exports, module){

// collections iterator
// --------------------

"use strict";

module.exports = Iterator;

var WeakMap = require("./weak-map");
var GenericCollection = require("./generic-collection");

// upgrades an iterable to a Iterator
function Iterator(iterable, start, stop, step) {
    if (!iterable) {
        return Iterator.empty;
    } else if (iterable instanceof Iterator) {
        return iterable;
    } else if (!(this instanceof Iterator)) {
        return new Iterator(iterable, start, stop, step);
    } else if (Array.isArray(iterable) || typeof iterable === "string") {
        iterators.set(this, new IndexIterator(iterable, start, stop, step));
        return;
    }
    iterable = Object(iterable);
    if (iterable.next) {
        iterators.set(this, iterable);
    } else if (iterable.iterate) {
        iterators.set(this, iterable.iterate(start, stop, step));
    } else if (Object.prototype.toString.call(iterable) === "[object Function]") {
        this.next = iterable;
    } else {
        throw new TypeError("Can't iterate " + iterable);
    }
}

// Using iterators as a hidden table associating a full-fledged Iterator with
// an underlying, usually merely "nextable", iterator.
var iterators = new WeakMap();

// Selectively apply generic methods of GenericCollection
Iterator.prototype.forEach = GenericCollection.prototype.forEach;
Iterator.prototype.map = GenericCollection.prototype.map;
Iterator.prototype.filter = GenericCollection.prototype.filter;
Iterator.prototype.every = GenericCollection.prototype.every;
Iterator.prototype.some = GenericCollection.prototype.some;
Iterator.prototype.min = GenericCollection.prototype.min;
Iterator.prototype.max = GenericCollection.prototype.max;
Iterator.prototype.sum = GenericCollection.prototype.sum;
Iterator.prototype.average = GenericCollection.prototype.average;
Iterator.prototype.flatten = GenericCollection.prototype.flatten;
Iterator.prototype.zip = GenericCollection.prototype.zip;
Iterator.prototype.enumerate = GenericCollection.prototype.enumerate;
Iterator.prototype.sorted = GenericCollection.prototype.sorted;
Iterator.prototype.group = GenericCollection.prototype.group;
Iterator.prototype.reversed = GenericCollection.prototype.reversed;
Iterator.prototype.toArray = GenericCollection.prototype.toArray;
Iterator.prototype.toObject = GenericCollection.prototype.toObject;

// This is a bit of a cheat so flatten and such work with the generic reducible
Iterator.prototype.constructClone = function (values) {
    var clone = [];
    clone.addEach(values);
    return clone;
};

// A level of indirection so a full-interface iterator can proxy for a simple
// nextable iterator, and to allow the child iterator to replace its governing
// iterator, as with drop-while iterators.
Iterator.prototype.next = function () {
    var nextable = iterators.get(this);
    if (nextable) {
        return nextable.next();
    } else {
        return Iterator.done;
    }
};

Iterator.prototype.iterateMap = function (callback /*, thisp*/) {
    var self = Iterator(this),
        thisp = arguments[1];
    return new MapIterator(self, callback, thisp);
};

function MapIterator(iterator, callback, thisp) {
    this.iterator = iterator;
    this.callback = callback;
    this.thisp = thisp;
}

MapIterator.prototype = Object.create(Iterator.prototype);
MapIterator.prototype.constructor = MapIterator;

MapIterator.prototype.next = function () {
    var iteration = this.iterator.next();
    if (iteration.done) {
        return iteration;
    } else {
        return new Iteration(
            this.callback.call(
                this.thisp,
                iteration.value,
                iteration.index,
                this.iteration
            ),
            iteration.index
        );
    }
};

Iterator.prototype.iterateFilter = function (callback /*, thisp*/) {
    var self = Iterator(this),
        thisp = arguments[1],
        index = 0;

    return new FilterIterator(self, callback, thisp);
};

function FilterIterator(iterator, callback, thisp) {
    this.iterator = iterator;
    this.callback = callback;
    this.thisp = thisp;
}

FilterIterator.prototype = Object.create(Iterator.prototype);
FilterIterator.prototype.constructor = FilterIterator;

FilterIterator.prototype.next = function () {
    var iteration;
    while (true) {
        iteration = this.iterator.next();
        if (iteration.done || this.callback.call(
            this.thisp,
            iteration.value,
            iteration.index,
            this.iteration
        )) {
            return iteration;
        }
    }
};

Iterator.prototype.reduce = function (callback /*, initial, thisp*/) {
    var self = Iterator(this),
        result = arguments[1],
        thisp = arguments[2],
        iteration;

    // First iteration unrolled
    iteration = self.next();
    if (iteration.done) {
        if (arguments.length > 1) {
            return arguments[1];
        } else {
            throw TypeError("Reduce of empty iterator with no initial value");
        }
    } else if (arguments.length > 1) {
        result = callback.call(
            thisp,
            result,
            iteration.value,
            iteration.index,
            self
        );
    } else {
        result = iteration.value;
    }

    // Remaining entries
    while (true) {
        iteration = self.next();
        if (iteration.done) {
            return result;
        } else {
            result = callback.call(
                thisp,
                result,
                iteration.value,
                iteration.index,
                self
            );
        }
    }
};

Iterator.prototype.dropWhile = function (callback /*, thisp */) {
    var self = Iterator(this),
        thisp = arguments[1],
        iteration;

    while (true) {
        iteration = self.next();
        if (iteration.done) {
            return Iterator.empty;
        } else if (!callback.call(thisp, iteration.value, iteration.index, self)) {
            return new DropWhileIterator(iteration, self);
        }
    }
};

function DropWhileIterator(iteration, iterator) {
    this.iteration = iteration;
    this.iterator = iterator;
    this.parent = null;
}

DropWhileIterator.prototype = Object.create(Iterator.prototype);
DropWhileIterator.prototype.constructor = DropWhileIterator;

DropWhileIterator.prototype.next = function () {
    var result = this.iteration;
    if (result) {
        this.iteration = null;
        return result;
    } else {
        return this.iterator.next();
    }
};

Iterator.prototype.takeWhile = function (callback /*, thisp*/) {
    var self = Iterator(this),
        thisp = arguments[1];
    return new TakeWhileIterator(self, callback, thisp);
};

function TakeWhileIterator(iterator, callback, thisp) {
    this.iterator = iterator;
    this.callback = callback;
    this.thisp = thisp;
}

TakeWhileIterator.prototype = Object.create(Iterator.prototype);
TakeWhileIterator.prototype.constructor = TakeWhileIterator;

TakeWhileIterator.prototype.next = function () {
    var iteration = this.iterator.next();
    if (iteration.done) {
        return iteration;
    } else if (this.callback.call(
        this.thisp,
        iteration.value,
        iteration.index,
        this.iterator
    )) {
        return iteration;
    } else {
        return Iterator.done;
    }
};

Iterator.prototype.iterateZip = function () {
    return Iterator.unzip(Array.prototype.concat.apply(this, arguments));
};

Iterator.prototype.iterateUnzip = function () {
    return Iterator.unzip(this);
};

Iterator.prototype.iterateEnumerate = function (start) {
    return Iterator.count(start).iterateZip(this);
};

Iterator.prototype.iterateConcat = function () {
    return Iterator.flatten(Array.prototype.concat.apply(this, arguments));
};

Iterator.prototype.iterateFlatten = function () {
    return Iterator.flatten(this);
};

Iterator.prototype.recount = function (start) {
    return new RecountIterator(this, start);
};

function RecountIterator(iterator, start) {
    this.iterator = iterator;
    this.index = start || 0;
}

RecountIterator.prototype = Object.create(Iterator.prototype);
RecountIterator.prototype.constructor = RecountIterator;

RecountIterator.prototype.next = function () {
    var iteration = this.iterator.next();
    if (iteration.done) {
        return iteration;
    } else {
        return new Iteration(
            iteration.value,
            this.index++
        );
    }
};

// creates an iterator for Array and String
function IndexIterator(iterable, start, stop, step) {
    if (step == null) {
        step = 1;
    }
    if (stop == null) {
        stop = start;
        start = 0;
    }
    if (start == null) {
        start = 0;
    }
    if (step == null) {
        step = 1;
    }
    if (stop == null) {
        stop = iterable.length;
    }
    this.iterable = iterable;
    this.start = start;
    this.stop = stop;
    this.step = step;
}

IndexIterator.prototype.next = function () {
    // Advance to next owned entry
    if (typeof this.iterable === "object") { // as opposed to string
        while (!(this.start in this.iterable)) {
            if (this.start >= this.stop) {
                return Iterator.done;
            } else {
                this.start += this.step;
            }
        }
    }
    if (this.start >= this.stop) { // end of string
        return Iterator.done;
    }
    var iteration = new Iteration(
        this.iterable[this.start],
        this.start
    );
    this.start += this.step;
    return iteration;
};

Iterator.cycle = function (cycle, times) {
    if (arguments.length < 2) {
        times = Infinity;
    }
    return new CycleIterator(cycle, times);
};

function CycleIterator(cycle, times) {
    this.cycle = cycle;
    this.times = times;
    this.iterator = Iterator.empty;
}

CycleIterator.prototype = Object.create(Iterator.prototype);
CycleIterator.prototype.constructor = CycleIterator;

CycleIterator.prototype.next = function () {
    var iteration = this.iterator.next();
    if (iteration.done) {
        if (this.times > 0) {
            this.times--;
            this.iterator = new Iterator(this.cycle);
            return this.iterator.next();
        } else {
            return iteration;
        }
    } else {
        return iteration;
    }
};

Iterator.concat = function (/* ...iterators */) {
    return Iterator.flatten(Array.prototype.slice.call(arguments));
};

Iterator.flatten = function (iterators) {
    iterators = Iterator(iterators);
    return new ChainIterator(iterators);
};

function ChainIterator(iterators) {
    this.iterators = iterators;
    this.iterator = Iterator.empty;
}

ChainIterator.prototype = Object.create(Iterator.prototype);
ChainIterator.prototype.constructor = ChainIterator;

ChainIterator.prototype.next = function () {
    var iteration = this.iterator.next();
    if (iteration.done) {
        var iteratorIteration = this.iterators.next();
        if (iteratorIteration.done) {
            return Iterator.done;
        } else {
            this.iterator = new Iterator(iteratorIteration.value);
            return this.iterator.next();
        }
    } else {
        return iteration;
    }
};

Iterator.unzip = function (iterators) {
    iterators = Iterator(iterators).map(Iterator);
    if (iterators.length === 0)
        return new Iterator.empty;
    return new UnzipIterator(iterators);
};

function UnzipIterator(iterators) {
    this.iterators = iterators;
    this.index = 0;
}

UnzipIterator.prototype = Object.create(Iterator.prototype);
UnzipIterator.prototype.constructor = UnzipIterator;

UnzipIterator.prototype.next = function () {
    var done = false
    var result = this.iterators.map(function (iterator) {
        var iteration = iterator.next();
        if (iteration.done) {
            done = true;
        } else {
            return iteration.value;
        }
    });
    if (done) {
        return Iterator.done;
    } else {
        return new Iteration(result, this.index++);
    }
};

Iterator.zip = function () {
    return Iterator.unzip(Array.prototype.slice.call(arguments));
};

Iterator.range = function (start, stop, step) {
    if (arguments.length < 3) {
        step = 1;
    }
    if (arguments.length < 2) {
        stop = start;
        start = 0;
    }
    start = start || 0;
    step = step || 1;
    return new RangeIterator(start, stop, step);
};

Iterator.count = function (start, step) {
    return Iterator.range(start, Infinity, step);
};

function RangeIterator(start, stop, step) {
    this.start = start;
    this.stop = stop;
    this.step = step;
    this.index = 0;
}

RangeIterator.prototype = Object.create(Iterator.prototype);
RangeIterator.prototype.constructor = RangeIterator;

RangeIterator.prototype.next = function () {
    if (this.start >= this.stop) {
        return Iterator.done;
    } else {
        var result = this.start;
        this.start += this.step;
        return new Iteration(result, this.index++);
    }
};

Iterator.repeat = function (value, times) {
    if (times == null) {
        times = Infinity;
    }
    return new RepeatIterator(value, times);
};

function RepeatIterator(value, times) {
    this.value = value;
    this.times = times;
    this.index = 0;
}

RepeatIterator.prototype = Object.create(Iterator.prototype);
RepeatIterator.prototype.constructor = RepeatIterator;

RepeatIterator.prototype.next = function () {
    if (this.index < this.times) {
        return new Iteration(this.value, this.index++);
    } else {
        return Iterator.done;
    }
};

Iterator.enumerate = function (values, start) {
    return Iterator.count(start).iterateZip(new Iterator(values));
};

function EmptyIterator() {}

EmptyIterator.prototype = Object.create(Iterator.prototype);
EmptyIterator.prototype.constructor = EmptyIterator;

EmptyIterator.prototype.next = function () {
    return Iterator.done;
};

Iterator.empty = new EmptyIterator();

// Iteration and DoneIteration exist here only to encourage hidden classes.
// Otherwise, iterations are merely duck-types.

function Iteration(value, index) {
    this.value = value;
    this.index = index;
}

Iteration.prototype.done = false;

Iteration.prototype.equals = function (that, equals, memo) {
    if (!that) return false;
    return (
        equals(this.value, that.value, equals, memo) &&
        this.index === that.index &&
        this.done === that.done
    );

};

function DoneIteration(value) {
    Iteration.call(this, value);
    this.done = true; // reflected on the instance to make it more obvious
}

DoneIteration.prototype = Object.create(Iteration.prototype);
DoneIteration.prototype.constructor = DoneIteration;
DoneIteration.prototype.done = true;

Iterator.Iteration = Iteration;
Iterator.DoneIteration = DoneIteration;
Iterator.done = new DoneIteration();

}],["collections","shim",{"./shim-array":7,"./shim-object":9,"./shim-function":8,"./shim-regexp":10},function (require, exports, module){

// collections shim
// ----------------


var Array = require("./shim-array");
var Object = require("./shim-object");
var Function = require("./shim-function");
var RegExp = require("./shim-regexp");

}],["collections","shim-array",{"./shim-function":8,"./generic-collection":3,"./generic-order":4,"./iterator":5,"weak-map":17},function (require, exports, module){

// collections shim-array
// ----------------------

"use strict";

/*
    Based in part on extras from Motorola Mobility’s Montage
    Copyright (c) 2012, Motorola Mobility LLC. All Rights Reserved.
    3-Clause BSD License
    https://github.com/motorola-mobility/montage/blob/master/LICENSE.md
*/

var Function = require("./shim-function");
var GenericCollection = require("./generic-collection");
var GenericOrder = require("./generic-order");
var Iterator = require("./iterator");
var WeakMap = require("weak-map");

module.exports = Array;

var array_splice = Array.prototype.splice;
var array_slice = Array.prototype.slice;

Array.empty = [];

if (Object.freeze) {
    Object.freeze(Array.empty);
}

Array.from = function (values) {
    var array = [];
    array.addEach(values);
    return array;
};

Array.unzip = function (table) {
    var transpose = [];
    var length = Infinity;
    // compute shortest row
    for (var i = 0; i < table.length; i++) {
        var row = table[i];
        table[i] = row.toArray();
        if (row.length < length) {
            length = row.length;
        }
    }
    for (var i = 0; i < table.length; i++) {
        var row = table[i];
        for (var j = 0; j < row.length; j++) {
            if (j < length && j in row) {
                transpose[j] = transpose[j] || [];
                transpose[j][i] = row[j];
            }
        }
    }
    return transpose;
};

function define(key, value) {
    Object.defineProperty(Array.prototype, key, {
        value: value,
        writable: true,
        configurable: true,
        enumerable: false
    });
}

define("addEach", GenericCollection.prototype.addEach);
define("deleteEach", GenericCollection.prototype.deleteEach);
define("toArray", GenericCollection.prototype.toArray);
define("toObject", GenericCollection.prototype.toObject);
define("min", GenericCollection.prototype.min);
define("max", GenericCollection.prototype.max);
define("sum", GenericCollection.prototype.sum);
define("average", GenericCollection.prototype.average);
define("only", GenericCollection.prototype.only);
define("flatten", GenericCollection.prototype.flatten);
define("zip", GenericCollection.prototype.zip);
define("enumerate", GenericCollection.prototype.enumerate);
define("group", GenericCollection.prototype.group);
define("sorted", GenericCollection.prototype.sorted);
define("reversed", GenericCollection.prototype.reversed);

define("constructClone", function (values) {
    var clone = new this.constructor();
    clone.addEach(values);
    return clone;
});

define("has", function (value, equals) {
    return this.findValue(value, equals) !== -1;
});

define("get", function (index, defaultValue) {
    if (+index !== index)
        throw new Error("Indicies must be numbers");
    if (!index in this) {
        return defaultValue;
    } else {
        return this[index];
    }
});

define("set", function (index, value) {
    if (index < this.length) {
        this.splice(index, 1, value);
    } else {
        // Must use swap instead of splice, dispite the unfortunate array
        // argument, because splice would truncate index to length.
        this.swap(index, 1, [value]);
    }
    return this;
});

define("add", function (value) {
    this.push(value);
    return true;
});

define("delete", function (value, equals) {
    var index = this.findValue(value, equals);
    if (index !== -1) {
        this.splice(index, 1);
        return true;
    }
    return false;
});

define("findValue", function (value, equals) {
    equals = equals || this.contentEquals || Object.equals;
    for (var index = 0; index < this.length; index++) {
        if (index in this && equals(this[index], value)) {
            return index;
        }
    }
    return -1;
});

define("findLastValue", function (value, equals) {
    equals = equals || this.contentEquals || Object.equals;
    var index = this.length;
    do {
        index--;
        if (index in this && equals(this[index], value)) {
            return index;
        }
    } while (index > 0);
    return -1;
});

define("swap", function (start, minusLength, plus) {
    // Unrolled implementation into JavaScript for a couple reasons.
    // Calling splice can cause large stack sizes for large swaps. Also,
    // splice cannot handle array holes.
    if (plus) {
        if (!Array.isArray(plus)) {
            plus = array_slice.call(plus);
        }
    } else {
        plus = Array.empty;
    }

    if (start < 0) {
        start = this.length + start;
    } else if (start > this.length) {
        this.length = start;
    }

    if (start + minusLength > this.length) {
        // Truncate minus length if it extends beyond the length
        minusLength = this.length - start;
    } else if (minusLength < 0) {
        // It is the JavaScript way.
        minusLength = 0;
    }

    var diff = plus.length - minusLength;
    var oldLength = this.length;
    var newLength = this.length + diff;

    if (diff > 0) {
        // Head Tail Plus Minus
        // H H H H M M T T T T
        // H H H H P P P P T T T T
        //         ^ start
        //         ^-^ minus.length
        //           ^ --> diff
        //         ^-----^ plus.length
        //             ^------^ tail before
        //                 ^------^ tail after
        //                   ^ start iteration
        //                       ^ start iteration offset
        //             ^ end iteration
        //                 ^ end iteration offset
        //             ^ start + minus.length
        //                     ^ length
        //                   ^ length - 1
        for (var index = oldLength - 1; index >= start + minusLength; index--) {
            var offset = index + diff;
            if (index in this) {
                this[offset] = this[index];
            } else {
                // Oddly, PhantomJS complains about deleting array
                // properties, unless you assign undefined first.
                this[offset] = void 0;
                delete this[offset];
            }
        }
    }
    for (var index = 0; index < plus.length; index++) {
        if (index in plus) {
            this[start + index] = plus[index];
        } else {
            this[start + index] = void 0;
            delete this[start + index];
        }
    }
    if (diff < 0) {
        // Head Tail Plus Minus
        // H H H H M M M M T T T T
        // H H H H P P T T T T
        //         ^ start
        //         ^-----^ length
        //         ^-^ plus.length
        //             ^ start iteration
        //                 ^ offset start iteration
        //                     ^ end
        //                         ^ offset end
        //             ^ start + minus.length - plus.length
        //             ^ start - diff
        //                 ^------^ tail before
        //             ^------^ tail after
        //                     ^ length - diff
        //                     ^ newLength
        for (var index = start + plus.length; index < oldLength - diff; index++) {
            var offset = index - diff;
            if (offset in this) {
                this[index] = this[offset];
            } else {
                this[index] = void 0;
                delete this[index];
            }
        }
    }
    this.length = newLength;
});

define("peek", function () {
    return this[0];
});

define("poke", function (value) {
    if (this.length > 0) {
        this[0] = value;
    }
});

define("peekBack", function () {
    if (this.length > 0) {
        return this[this.length - 1];
    }
});

define("pokeBack", function (value) {
    if (this.length > 0) {
        this[this.length - 1] = value;
    }
});

define("one", function () {
    for (var i in this) {
        if (Object.owns(this, i)) {
            return this[i];
        }
    }
});

define("clear", function () {
    this.length = 0;
    return this;
});

define("compare", function (that, compare) {
    compare = compare || Object.compare;
    var i;
    var length;
    var lhs;
    var rhs;
    var relative;

    if (this === that) {
        return 0;
    }

    if (!that || !Array.isArray(that)) {
        return GenericOrder.prototype.compare.call(this, that, compare);
    }

    length = Math.min(this.length, that.length);

    for (i = 0; i < length; i++) {
        if (i in this) {
            if (!(i in that)) {
                return -1;
            } else {
                lhs = this[i];
                rhs = that[i];
                relative = compare(lhs, rhs);
                if (relative) {
                    return relative;
                }
            }
        } else if (i in that) {
            return 1;
        }
    }

    return this.length - that.length;
});

define("equals", function (that, equals, memo) {
    equals = equals || Object.equals;
    var i = 0;
    var length = this.length;
    var left;
    var right;

    if (this === that) {
        return true;
    }
    if (!that || !Array.isArray(that)) {
        return GenericOrder.prototype.equals.call(this, that);
    }

    if (length !== that.length) {
        return false;
    } else {
        for (; i < length; ++i) {
            if (i in this) {
                if (!(i in that)) {
                    return false;
                }
                left = this[i];
                right = that[i];
                if (!equals(left, right, equals, memo)) {
                    return false;
                }
            } else {
                if (i in that) {
                    return false;
                }
            }
        }
    }
    return true;
});

define("clone", function (depth, memo) {
    if (depth === undefined) {
        depth = Infinity;
    } else if (depth === 0) {
        return this;
    }
    memo = memo || new WeakMap();
    var clone = [];
    for (var i in this) {
        if (Object.owns(this, i)) {
            clone[i] = Object.clone(this[i], depth - 1, memo);
        }
    };
    return clone;
});

define("iterate", function (start, stop, step) {
    return new Iterator(this, start, stop, step);
});

}],["collections","shim-function",{},function (require, exports, module){

// collections shim-function
// -------------------------


module.exports = Function;

/**
    A utility to reduce unnecessary allocations of <code>function () {}</code>
    in its many colorful variations.  It does nothing and returns
    <code>undefined</code> thus makes a suitable default in some circumstances.

    @function external:Function.noop
*/
Function.noop = function () {
};

/**
    A utility to reduce unnecessary allocations of <code>function (x) {return
    x}</code> in its many colorful but ultimately wasteful parameter name
    variations.

    @function external:Function.identity
    @param {Any} any value
    @returns {Any} that value
*/
Function.identity = function (value) {
    return value;
};

/**
    A utility for creating a comparator function for a particular aspect of a
    figurative class of objects.

    @function external:Function.by
    @param {Function} relation A function that accepts a value and returns a
    corresponding value to use as a representative when sorting that object.
    @param {Function} compare an alternate comparator for comparing the
    represented values.  The default is <code>Object.compare</code>, which
    does a deep, type-sensitive, polymorphic comparison.
    @returns {Function} a comparator that has been annotated with
    <code>by</code> and <code>compare</code> properties so
    <code>sorted</code> can perform a transform that reduces the need to call
    <code>by</code> on each sorted object to just once.
 */
Function.by = function (by , compare) {
    compare = compare || Object.compare;
    by = by || Function.identity;
    var compareBy = function (a, b) {
        return compare(by(a), by(b));
    };
    compareBy.compare = compare;
    compareBy.by = by;
    return compareBy;
};

// TODO document
Function.get = function (key) {
    return function (object) {
        return Object.get(object, key);
    };
};

}],["collections","shim-object",{"weak-map":17},function (require, exports, module){

// collections shim-object
// -----------------------

"use strict";

var WeakMap = require("weak-map");

module.exports = Object;

/*
    Based in part on extras from Motorola Mobility’s Montage
    Copyright (c) 2012, Motorola Mobility LLC. All Rights Reserved.
    3-Clause BSD License
    https://github.com/motorola-mobility/montage/blob/master/LICENSE.md
*/

/**
    Defines extensions to intrinsic <code>Object</code>.
    @see [Object class]{@link external:Object}
*/

/**
    A utility object to avoid unnecessary allocations of an empty object
    <code>{}</code>.  This object is frozen so it is safe to share.

    @object external:Object.empty
*/
Object.empty = Object.freeze(Object.create(null));

/**
    Returns whether the given value is an object, as opposed to a value.
    Unboxed numbers, strings, true, false, undefined, and null are not
    objects.  Arrays are objects.

    @function external:Object.isObject
    @param {Any} value
    @returns {Boolean} whether the given value is an object
*/
Object.isObject = function (object) {
    return Object(object) === object;
};

/**
    Returns the value of an any value, particularly objects that
    implement <code>valueOf</code>.

    <p>Note that, unlike the precedent of methods like
    <code>Object.equals</code> and <code>Object.compare</code> would suggest,
    this method is named <code>Object.getValueOf</code> instead of
    <code>valueOf</code>.  This is a delicate issue, but the basis of this
    decision is that the JavaScript runtime would be far more likely to
    accidentally call this method with no arguments, assuming that it would
    return the value of <code>Object</code> itself in various situations,
    whereas <code>Object.equals(Object, null)</code> protects against this case
    by noting that <code>Object</code> owns the <code>equals</code> property
    and therefore does not delegate to it.

    @function external:Object.getValueOf
    @param {Any} value a value or object wrapping a value
    @returns {Any} the primitive value of that object, if one exists, or passes
    the value through
*/
Object.getValueOf = function (value) {
    if (value && typeof value.valueOf === "function") {
        value = value.valueOf();
    }
    return value;
};

var hashMap = new WeakMap();
Object.hash = function (object) {
    if (object && typeof object.hash === "function") {
        return "" + object.hash();
    } else if (Object.isObject(object)) {
        if (!hashMap.has(object)) {
            hashMap.set(object, Math.random().toString(36).slice(2));
        }
        return hashMap.get(object);
    } else {
        return "" + object;
    }
};

/**
    A shorthand for <code>Object.prototype.hasOwnProperty.call(object,
    key)</code>.  Returns whether the object owns a property for the given key.
    It does not consult the prototype chain and works for any string (including
    "hasOwnProperty") except "__proto__".

    @function external:Object.owns
    @param {Object} object
    @param {String} key
    @returns {Boolean} whether the object owns a property wfor the given key.
*/
var owns = Object.prototype.hasOwnProperty;
Object.owns = function (object, key) {
    return owns.call(object, key);
};

/**
    A utility that is like Object.owns but is also useful for finding
    properties on the prototype chain, provided that they do not refer to
    methods on the Object prototype.  Works for all strings except "__proto__".

    <p>Alternately, you could use the "in" operator as long as the object
    descends from "null" instead of the Object.prototype, as with
    <code>Object.create(null)</code>.  However,
    <code>Object.create(null)</code> only works in fully compliant EcmaScript 5
    JavaScript engines and cannot be faithfully shimmed.

    <p>If the given object is an instance of a type that implements a method
    named "has", this function defers to the collection, so this method can be
    used to generically handle objects, arrays, or other collections.  In that
    case, the domain of the key depends on the instance.

    @param {Object} object
    @param {String} key
    @returns {Boolean} whether the object, or any of its prototypes except
    <code>Object.prototype</code>
    @function external:Object.has
*/
Object.has = function (object, key) {
    if (typeof object !== "object") {
        throw new Error("Object.has can't accept non-object: " + typeof object);
    }
    // forward to mapped collections that implement "has"
    if (object && typeof object.has === "function") {
        return object.has(key);
    // otherwise report whether the key is on the prototype chain,
    // as long as it is not one of the methods on object.prototype
    } else if (typeof key === "string") {
        return key in object && object[key] !== Object.prototype[key];
    } else {
        throw new Error("Key must be a string for Object.has on plain objects");
    }
};

/**
    Gets the value for a corresponding key from an object.

    <p>Uses Object.has to determine whether there is a corresponding value for
    the given key.  As such, <code>Object.get</code> is capable of retriving
    values from the prototype chain as long as they are not from the
    <code>Object.prototype</code>.

    <p>If there is no corresponding value, returns the given default, which may
    be <code>undefined</code>.

    <p>If the given object is an instance of a type that implements a method
    named "get", this function defers to the collection, so this method can be
    used to generically handle objects, arrays, or other collections.  In that
    case, the domain of the key depends on the implementation.  For a `Map`,
    for example, the key might be any object.

    @param {Object} object
    @param {String} key
    @param {Any} value a default to return, <code>undefined</code> if omitted
    @returns {Any} value for key, or default value
    @function external:Object.get
*/
Object.get = function (object, key, value) {
    if (typeof object !== "object") {
        throw new Error("Object.get can't accept non-object: " + typeof object);
    }
    // forward to mapped collections that implement "get"
    if (object && typeof object.get === "function") {
        return object.get(key, value);
    } else if (Object.has(object, key)) {
        return object[key];
    } else {
        return value;
    }
};

/**
    Sets the value for a given key on an object.

    <p>If the given object is an instance of a type that implements a method
    named "set", this function defers to the collection, so this method can be
    used to generically handle objects, arrays, or other collections.  As such,
    the key domain varies by the object type.

    @param {Object} object
    @param {String} key
    @param {Any} value
    @returns <code>undefined</code>
    @function external:Object.set
*/
Object.set = function (object, key, value) {
    if (object && typeof object.set === "function") {
        object.set(key, value);
    } else {
        object[key] = value;
    }
};

Object.addEach = function (target, source) {
    if (!source) {
    } else if (typeof source.forEach === "function" && !source.hasOwnProperty("forEach")) {
        // copy map-alikes
        if (typeof source.keys === "function") {
            source.forEach(function (value, key) {
                target[key] = value;
            });
        // iterate key value pairs of other iterables
        } else {
            source.forEach(function (pair) {
                target[pair[0]] = pair[1];
            });
        }
    } else {
        // copy other objects as map-alikes
        Object.keys(source).forEach(function (key) {
            target[key] = source[key];
        });
    }
    return target;
};

/**
    Iterates over the owned properties of an object.

    @function external:Object.forEach
    @param {Object} object an object to iterate.
    @param {Function} callback a function to call for every key and value
    pair in the object.  Receives <code>value</code>, <code>key</code>,
    and <code>object</code> as arguments.
    @param {Object} thisp the <code>this</code> to pass through to the
    callback
*/
Object.forEach = function (object, callback, thisp) {
    Object.keys(object).forEach(function (key) {
        callback.call(thisp, object[key], key, object);
    });
};

/**
    Iterates over the owned properties of a map, constructing a new array of
    mapped values.

    @function external:Object.map
    @param {Object} object an object to iterate.
    @param {Function} callback a function to call for every key and value
    pair in the object.  Receives <code>value</code>, <code>key</code>,
    and <code>object</code> as arguments.
    @param {Object} thisp the <code>this</code> to pass through to the
    callback
    @returns {Array} the respective values returned by the callback for each
    item in the object.
*/
Object.map = function (object, callback, thisp) {
    return Object.keys(object).map(function (key) {
        return callback.call(thisp, object[key], key, object);
    });
};

/**
    Returns the values for owned properties of an object.

    @function external:Object.map
    @param {Object} object
    @returns {Array} the respective value for each owned property of the
    object.
*/
Object.values = function (object) {
    return Object.map(object, Function.identity);
};

// TODO inline document concat
Object.concat = function () {
    var object = {};
    for (var i = 0; i < arguments.length; i++) {
        Object.addEach(object, arguments[i]);
    }
    return object;
};

Object.from = Object.concat;

/**
    Returns whether two values are identical.  Any value is identical to itself
    and only itself.  This is much more restictive than equivalence and subtly
    different than strict equality, <code>===</code> because of edge cases
    including negative zero and <code>NaN</code>.  Identity is useful for
    resolving collisions among keys in a mapping where the domain is any value.
    This method does not delgate to any method on an object and cannot be
    overridden.
    @see http://wiki.ecmascript.org/doku.php?id=harmony:egal
    @param {Any} this
    @param {Any} that
    @returns {Boolean} whether this and that are identical
    @function external:Object.is
*/
Object.is = function (x, y) {
    if (x === y) {
        // 0 === -0, but they are not identical
        return x !== 0 || 1 / x === 1 / y;
    }
    // NaN !== NaN, but they are identical.
    // NaNs are the only non-reflexive value, i.e., if x !== x,
    // then x is a NaN.
    // isNaN is broken: it converts its argument to number, so
    // isNaN("foo") => true
    return x !== x && y !== y;
};

/**
    Performs a polymorphic, type-sensitive deep equivalence comparison of any
    two values.

    <p>As a basic principle, any value is equivalent to itself (as in
    identity), any boxed version of itself (as a <code>new Number(10)</code> is
    to 10), and any deep clone of itself.

    <p>Equivalence has the following properties:

    <ul>
        <li><strong>polymorphic:</strong>
            If the given object is an instance of a type that implements a
            methods named "equals", this function defers to the method.  So,
            this function can safely compare any values regardless of type,
            including undefined, null, numbers, strings, any pair of objects
            where either implements "equals", or object literals that may even
            contain an "equals" key.
        <li><strong>type-sensitive:</strong>
            Incomparable types are not equal.  No object is equivalent to any
            array.  No string is equal to any other number.
        <li><strong>deep:</strong>
            Collections with equivalent content are equivalent, recursively.
        <li><strong>equivalence:</strong>
            Identical values and objects are equivalent, but so are collections
            that contain equivalent content.  Whether order is important varies
            by type.  For Arrays and lists, order is important.  For Objects,
            maps, and sets, order is not important.  Boxed objects are mutally
            equivalent with their unboxed values, by virtue of the standard
            <code>valueOf</code> method.
    </ul>
    @param this
    @param that
    @returns {Boolean} whether the values are deeply equivalent
    @function external:Object.equals
*/
Object.equals = function (a, b, equals, memo) {
    equals = equals || Object.equals;
    // unbox objects, but do not confuse object literals
    a = Object.getValueOf(a);
    b = Object.getValueOf(b);
    if (a === b)
        return true;
    if (Object.isObject(a)) {
        memo = memo || new WeakMap();
        if (memo.has(a)) {
            return true;
        }
        memo.set(a, true);
    }
    if (Object.isObject(a) && typeof a.equals === "function") {
        return a.equals(b, equals, memo);
    }
    // commutative
    if (Object.isObject(b) && typeof b.equals === "function") {
        return b.equals(a, equals, memo);
    }
    if (Object.isObject(a) && Object.isObject(b)) {
        if (Object.getPrototypeOf(a) === Object.prototype && Object.getPrototypeOf(b) === Object.prototype) {
            for (var name in a) {
                if (!equals(a[name], b[name], equals, memo)) {
                    return false;
                }
            }
            for (var name in b) {
                if (!(name in a) || !equals(b[name], a[name], equals, memo)) {
                    return false;
                }
            }
            return true;
        }
    }
    // NaN !== NaN, but they are equal.
    // NaNs are the only non-reflexive value, i.e., if x !== x,
    // then x is a NaN.
    // isNaN is broken: it converts its argument to number, so
    // isNaN("foo") => true
    // We have established that a !== b, but if a !== a && b !== b, they are
    // both NaN.
    if (a !== a && b !== b)
        return true;
    if (!a || !b)
        return a === b;
    return false;
};

// Because a return value of 0 from a `compare` function  may mean either
// "equals" or "is incomparable", `equals` cannot be defined in terms of
// `compare`.  However, `compare` *can* be defined in terms of `equals` and
// `lessThan`.  Again however, more often it would be desirable to implement
// all of the comparison functions in terms of compare rather than the other
// way around.

/**
    Determines the order in which any two objects should be sorted by returning
    a number that has an analogous relationship to zero as the left value to
    the right.  That is, if the left is "less than" the right, the returned
    value will be "less than" zero, where "less than" may be any other
    transitive relationship.

    <p>Arrays are compared by the first diverging values, or by length.

    <p>Any two values that are incomparable return zero.  As such,
    <code>equals</code> should not be implemented with <code>compare</code>
    since incomparability is indistinguishable from equality.

    <p>Sorts strings lexicographically.  This is not suitable for any
    particular international setting.  Different locales sort their phone books
    in very different ways, particularly regarding diacritics and ligatures.

    <p>If the given object is an instance of a type that implements a method
    named "compare", this function defers to the instance.  The method does not
    need to be an owned property to distinguish it from an object literal since
    object literals are incomparable.  Unlike <code>Object</code> however,
    <code>Array</code> implements <code>compare</code>.

    @param {Any} left
    @param {Any} right
    @returns {Number} a value having the same transitive relationship to zero
    as the left and right values.
    @function external:Object.compare
*/
Object.compare = function (a, b) {
    // unbox objects, but do not confuse object literals
    // mercifully handles the Date case
    a = Object.getValueOf(a);
    b = Object.getValueOf(b);
    if (a === b)
        return 0;
    var aType = typeof a;
    var bType = typeof b;
    if (aType === "number" && bType === "number")
        return a - b;
    if (aType === "string" && bType === "string")
        return a < b ? -Infinity : Infinity;
        // the possibility of equality elimiated above
    if (a && typeof a.compare === "function")
        return a.compare(b);
    // not commutative, the relationship is reversed
    if (b && typeof b.compare === "function")
        return -b.compare(a);
    return 0;
};

/**
    Creates a deep copy of any value.  Values, being immutable, are
    returned without alternation.  Forwards to <code>clone</code> on
    objects and arrays.

    @function external:Object.clone
    @param {Any} value a value to clone
    @param {Number} depth an optional traversal depth, defaults to infinity.
    A value of <code>0</code> means to make no clone and return the value
    directly.
    @param {Map} memo an optional memo of already visited objects to preserve
    reference cycles.  The cloned object will have the exact same shape as the
    original, but no identical objects.  Te map may be later used to associate
    all objects in the original object graph with their corresponding member of
    the cloned graph.
    @returns a copy of the value
*/
Object.clone = function (value, depth, memo) {
    value = Object.getValueOf(value);
    memo = memo || new WeakMap();
    if (depth === undefined) {
        depth = Infinity;
    } else if (depth === 0) {
        return value;
    }
    if (typeof value === "function") {
        return value;
    } else if (Object.isObject(value)) {
        if (!memo.has(value)) {
            if (value && typeof value.clone === "function") {
                memo.set(value, value.clone(depth, memo));
            } else {
                var prototype = Object.getPrototypeOf(value);
                if (prototype === null || prototype === Object.prototype) {
                    var clone = Object.create(prototype);
                    memo.set(value, clone);
                    for (var key in value) {
                        clone[key] = Object.clone(value[key], depth - 1, memo);
                    }
                } else {
                    throw new Error("Can't clone " + value);
                }
            }
        }
        return memo.get(value);
    }
    return value;
};

/**
    Removes all properties owned by this object making the object suitable for
    reuse.

    @function external:Object.clear
    @returns this
*/
Object.clear = function (object) {
    if (object && typeof object.clear === "function") {
        object.clear();
    } else {
        var keys = Object.keys(object),
            i = keys.length;
        while (i) {
            i--;
            delete object[keys[i]];
        }
    }
    return object;
};

}],["collections","shim-regexp",{},function (require, exports, module){

// collections shim-regexp
// -----------------------


/**
    accepts a string; returns the string with regex metacharacters escaped.
    the returned string can safely be used within a regex to match a literal
    string. escaped characters are [, ], {, }, (, ), -, *, +, ?, ., \, ^, $,
    |, #, [comma], and whitespace.
*/
if (!RegExp.escape) {
    var special = /[-[\]{}()*+?.\\^$|,#\s]/g;
    RegExp.escape = function (string) {
        return string.replace(special, "\\$&");
    };
}

}],["mr","boot/script-params",{"url":14},function (require, exports, module){

// mr boot/script-params
// ---------------------


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

}],["mr","browser",{"./common":13,"url":14,"q":16,"./script":15},function (require, exports, module){

// mr browser
// ----------

/*
 * Based in part on Motorola Mobility’s Montage
 * Copyright (c) 2012, Motorola Mobility LLC. All Rights Reserved.
 * 3-Clause BSD License
 * https://github.com/motorola-mobility/montage/blob/master/LICENSE.md
 */
/*global montageDefine:true, -URL */
/*jshint -W015, evil:true, camelcase:false */

var Require = require("./common");
var URL = require("url");
var Q = require("q");
var GET = "GET";
var APPLICATION_JAVASCRIPT_MIMETYPE = "application/javascript";
var FILE_PROTOCOL = "file:";

module.exports = Require;

Require.getLocation = function() {
    return URL.resolve(window.location, ".");
};

Require.overlays = ["window", "browser", "montage"];

// Determine if an XMLHttpRequest was successful
// Some versions of WebKit return 0 for successful file:// URLs
function xhrSuccess(req) {
    return (req.status === 200 || (req.status === 0 && req.responseText));
}

// Due to crazy variabile availability of new and old XHR APIs across
// platforms, this implementation registers every known name for the event
// listeners.  The promise library ascertains that the returned promise
// is resolved only by the first event.
// http://dl.dropbox.com/u/131998/yui/misc/get/browser-capabilities.html
Require.read = function (location) {

    if (URL.resolve(window.location, location).indexOf(FILE_PROTOCOL) === 0) {
        throw new Error("XHR does not function for file: protocol");
    }

    var request = new XMLHttpRequest();
    var response = Q.defer();

    function onload() {
        if (xhrSuccess(request)) {
            response.resolve(request.responseText);
        } else {
            onerror();
        }
    }

    function onerror() {
        response.reject(new Error("Can't XHR " + JSON.stringify(location)));
    }

    try {
        request.open(GET, location, true);
        if (request.overrideMimeType) {
            request.overrideMimeType(APPLICATION_JAVASCRIPT_MIMETYPE);
        }
        request.onreadystatechange = function () {
            if (request.readyState === 4) {
                onload();
            }
        };
        request.onload = request.load = onload;
        request.onerror = request.error = onerror;
    } catch (exception) {
        response.reject(exception);
    }

    request.send();
    return response.promise;
};

// By using a named "eval" most browsers will execute in the global scope.
// http://www.davidflanagan.com/2010/12/global-eval-in.html
// Unfortunately execScript doesn't always return the value of the evaluated expression (at least in Chrome)
var globalEval = /*this.execScript ||*/eval;
// For Firebug evaled code isn't debuggable otherwise
// http://code.google.com/p/fbug/issues/detail?id=2198
if (global.navigator && global.navigator.userAgent.indexOf("Firefox") >= 0) {
    globalEval = new Function("_", "return eval(_)");
}

var __FILE__String = "__FILE__",
    Underscore = "_",
    globalEvalConstantA = "(function ",
    globalEvalConstantB = "(require, exports, module, __filename, __dirname) {",
    globalEvalConstantC = "//*/\n})\n//@ sourceURL=";

Require.Compiler = function (config) {
    return function(module) {
        if (module.factory || module.text === void 0 || module.type !== "js") {
            return;
        }
        if (config.useScriptInjection) {
            throw new Error("Can't use eval.");
        }

        // Here we use a couple tricks to make debugging better in various browsers:
        // TODO: determine if these are all necessary / the best options
        // 1. name the function with something inteligible since some debuggers display the first part of each eval (Firebug)
        // 2. append the "//@ sourceURL=location" hack (Safari, Chrome, Firebug)
        //  * http://pmuellr.blogspot.com/2009/06/debugger-friendly.html
        //  * http://blog.getfirebug.com/2009/08/11/give-your-eval-a-name-with-sourceurl/
        //      TODO: investigate why this isn't working in Firebug.
        // 3. set displayName property on the factory function (Safari, Chrome)

        var displayName = (module.require.config.name + Underscore + module.id).replace(/[^\w\d]|^\d/g, Underscore);

        try {
            module.factory = globalEval(globalEvalConstantA+displayName+globalEvalConstantB+module.text+globalEvalConstantC+module.location);
            if (!config.saveText) {
                delete module.text; // save some space
            }
        } catch (exception) {
            exception.message = exception.message + " in " + module.location;
            throw exception;
        }

        // This should work and would be simpler, but Firebug does not show scripts executed via "new Function()" constructor.
        // TODO: sniff browser?
        // module.factory = new Function("require", "exports", "module", module.text + "\n//*/"+sourceURLComment);

        module.factory.displayName = displayName;
    };
};

Require.XhrLoader = function (config) {
    return function (location, module) {
        return config.read(location)
        .then(function (text) {
            module.text = text;
            module.location = location;
        });
    };
};

var definitions = {};
var getDefinition = function (hash, id) {
    definitions[hash] = definitions[hash] || {};
    definitions[hash][id] = definitions[hash][id] || Q.defer();
    return definitions[hash][id];
};

// global
montageDefine = function (hash, id, module) {
    getDefinition(hash, id).resolve(module);
};

Require.loadScript = require("./script");

Require.ScriptLoader = function (config) {
    var hash = config.packageDescription.hash;
    return function (location, module) {
        return Q.try(function () {

            // short-cut by predefinition
            if (definitions[hash] && definitions[hash][module.id]) {
                return definitions[hash][module.id].promise;
            }

            if (/\.js$/.test(location)) {
                location = location.replace(/\.js/, ".load.js");
            } else {
                location += ".load.js";
            }

            Require.loadScript(location);

            var definition = getDefinition(hash, module.id).promise;
            loadIfNotPreloaded(location, definition, config.preloaded);
            return definition;
        })
        .then(function (definition) {
            /*jshint -W089 */
            delete definitions[hash][module.id];
            for (var name in definition) {
                module[name] = definition[name];
            }
            module.location = location;
            module.directory = URL.resolve(location, ".");
            /*jshint +W089 */
        });
    };
};

// old version
var loadPackageDescription = Require.loadPackageDescription;
Require.loadPackageDescription = function (dependency, config) {
    if (dependency.hash) { // use script injection
        var definition = getDefinition(dependency.hash, "package.json").promise;
        var location = URL.resolve(dependency.location, "package.json.load.js");
        loadIfNotPreloaded(location, definition, config.preloaded);
        return definition.get("exports");
    } else {
        // fall back to normal means
        return loadPackageDescription(dependency, config);
    }
};

Require.makeLoader = function (config) {
    var Loader;
    if (config.useScriptInjection) {
        Loader = Require.ScriptLoader;
    } else {
        Loader = Require.XhrLoader;
    }
    return Require.CommonLoader(config, Loader(config));
};

function loadIfNotPreloaded(location, definition, preloaded) {
    // The package.json might come in a preloading bundle. If so, we do not
    // want to issue a script injection. However, if by the time preloading
    // has finished the package.json has not arrived, we will need to kick off
    // a request for the requested script.
    if (preloaded && preloaded.isPending()) {
        preloaded
        .then(function () {
            if (definition.isPending()) {
                Require.loadScript(location);
            }
        })
        .done();
    } else if (definition.isPending()) {
        // otherwise preloading has already completed and we don't have the
        // module, so load it
        Require.loadScript(location);
    }
}

}],["mr","common",{"q":16,"url":14},function (require, exports, module){

// mr common
// ---------

/*
 * Based in part on Motorola Mobility’s Montage
 * Copyright (c) 2012, Motorola Mobility LLC. All Rights Reserved.
 * 3-Clause BSD License
 * https://github.com/motorola-mobility/montage/blob/master/LICENSE.md
 */
/*global -URL */
/*jshint node:true */

var Require = exports;
var Q = require("q");
var URL = require("url");

if (!this) {
    throw new Error("Require does not work in strict mode.");
}

var globalEval = eval; // reassigning causes eval to not use lexical scope.

// Non-CommonJS speced extensions should be marked with an "// EXTENSION"
// comment.

Require.makeRequire = function (config) {
    var require;

    // Configuration defaults:
    config = config || {};
    config.location = URL.resolve(config.location || Require.getLocation(), "./");
    config.paths = config.paths || [config.location];
    config.mappings = config.mappings || {}; // EXTENSION
    config.exposedConfigs = config.exposedConfigs || Require.exposedConfigs;
    config.makeLoader = config.makeLoader || Require.makeLoader;
    config.load = config.load || config.makeLoader(config);
    config.makeCompiler = config.makeCompiler || Require.makeCompiler;
    config.compile = config.compile || config.makeCompiler(config);
    config.parseDependencies = config.parseDependencies || Require.parseDependencies;
    config.read = config.read || Require.read;
    config.optimizers = config.optimizers || {};
    config.compilers = config.compilers || {};
    config.translators = config.translators || {};
    config.redirectTable = config.redirectTable || [];

    // Modules: { exports, id, location, directory, factory, dependencies,
    // dependees, text, type }
    var modules = config.modules = config.modules || {};

    // produces an entry in the module state table, which gets built
    // up through loading and execution, ultimately serving as the
    // ``module`` free variable inside the corresponding module.
    function getModuleDescriptor(id) {
        var lookupId = id.toLowerCase();
        if (!has(modules, lookupId)) {
            var extension = Require.extension(id);
            var type;
            if (
                extension && (
                    has(config.optimizers, extension) ||
                    has(config.translators, extension) ||
                    has(config.compilers, extension)
                )
            ) {
                type = extension;
            } else {
                type = "js";
            }
            modules[lookupId] = {
                id: id,
                extension: extension,
                type: type,
                display: (config.name || config.location) + "#" + id,
                require: makeRequire(id)
            };
        }
        return modules[lookupId];
    }

    // for preloading modules by their id and exports, useful to
    // prevent wasteful multiple instantiation if a module was loaded
    // in the bootstrapping process and can be trivially injected into
    // the system.
    function inject(id, exports) {
        var module = getModuleDescriptor(id);
        module.exports = exports;
        module.location = URL.resolve(config.location, id);
        module.directory = URL.resolve(module.location, "./");
        module.injected = true;
        module.type = void 0;
        delete module.redirect;
        delete module.mappingRedirect;
    }

    // Ensures a module definition is loaded, compiled, analyzed
    var load = memoize(function (topId, viaId, loading) {
        var module = getModuleDescriptor(topId);
        return Q.try(function () {
            // If not already loaded, already instantiated, or configured as a
            // redirection to another module.
            if (
                module.factory === void 0 &&
                module.exports === void 0 &&
                module.redirect === void 0
            ) {
                return Q(config.load).call(void 0, topId, module);
            }
        })
        .then(function () {
            // Translate (to JavaScript, optionally provide dependency analysis
            // services).
            if (module.type !== "js" && has(config.translators, module.type)) {
                var translatorId = config.translators[module.type];
                return Q.try(function () {
                    // The use of a preprocessor package is optional for
                    // translators, though mandatory for optimizers because
                    // there are .js to .js optimizers, but no such
                    // translators.
                    if (config.hasPreprocessorPackage) {
                        return config.loadPreprocessorPackage();
                    } else {
                        return require;
                    }
                })
                .invoke("async", translatorId)
                .then(function (translate) {
                    module.text = translate(module.text, module);
                    module.type = "js";
                });
            }
        })
        .then(function () {
            if (module.type === "js" && module.text !== void 0 && module.dependencies === void 0) {
                // Remove the shebang
                module.text = module.text.replace(/^#!/, "//#!");
                // Parse dependencies.
                module.dependencies = config.parseDependencies(module.text);
            }

            // Run optional optimizers.
            // {text, type} to {text', type')
            if (config.hasPreprocessorPackage && has(config.optimizers, module.type)) {
                var optimizerId = config.optimizers[module.type];
                return config.loadPreprocessorPackage()
                .invoke("async", optimizerId)
                .then(function (optimize) {
                    optimize(module);
                });
            }
        })
        .then(function () {
            if (
                module.factory === void 0 &&
                module.redirect === void 0 &&
                module.exports === void 0
            ) {
                // Then apply configured compilers.  module {text, type} to
                // {dependencies, factory || exports || redirect}
                if (has(config.compilers, module.type)) {
                    var compilerId = config.compilers[module.type];
                    return deepLoad(compilerId, "", loading)
                    .then(function () {
                        var compile = require(compilerId);
                        compile(module);
                    });
                } else if (module.type === "js") {
                    config.compile(module);
                }
            }

            // Final dependency massaging
            var dependencies = module.dependencies = module.dependencies || [];
            if (module.redirect !== void 0) {
                dependencies.push(module.redirect);
            }
            if (module.extraDependencies !== void 0) {
                Array.prototype.push.apply(module.dependencies, module.extraDependencies);
            }
        });

    });

    // Load a module definition, and the definitions of its transitive
    // dependencies
    function deepLoad(topId, viaId, loading) {
        var module = getModuleDescriptor(topId);
        // this is a memo of modules already being loaded so we don’t
        // data-lock on a cycle of dependencies.
        loading = loading || {};
        // has this all happened before?  will it happen again?
        if (has(loading, topId)) {
            return; // break the cycle of violence.
        }
        loading[topId] = true; // this has happened before
        return load(topId, viaId)
        .then(function () {
            // load the transitive dependencies using the magic of
            // recursion.
            var dependencies = module.dependencies = module.dependencies || [];
            return Q.all(module.dependencies.map(function (depId) {
                depId = resolve(depId, topId);
                // create dependees set, purely for debug purposes
                var module = getModuleDescriptor(depId);
                var dependees = module.dependees = module.dependees || {};
                dependees[topId] = true;
                return deepLoad(depId, topId, loading);
            }));
        }, function (error) {
            module.error = error;
        });
    }

    function lookup(topId, viaId) {
        topId = resolve(topId, viaId);
        var module = getModuleDescriptor(topId);

        // check for consistent case convention
        if (module.id !== topId) {
            throw new Error(
                "Can't require module " + JSON.stringify(module.id) +
                " by alternate spelling " + JSON.stringify(topId)
            );
        }

        // handle redirects
        if (module.redirect !== void 0) {
            return lookup(module.redirect, topId);
        }

        // handle cross-package linkage
        if (module.mappingRedirect !== void 0) {
            return module.mappingRequire.lookup(module.mappingRedirect, "");
        }

        return module;
    }

    // Initializes a module by executing the factory function with a new
    // module "exports" object.
    function getExports(topId, viaId) {
        var module = getModuleDescriptor(topId);

        // check for consistent case convention
        if (module.id !== topId) {
            throw new Error(
                "Can't require module " + JSON.stringify(module.id) +
                " by alternate spelling " + JSON.stringify(topId)
            );
        }

        // check for load error
        if (module.error) {
            var error = module.error;
            error.message = (
                "Can't require module " + JSON.stringify(module.id) +
                " via " + JSON.stringify(viaId) +
                " in " + JSON.stringify(config.name || config.location) +
                " because " + error.message
            );
            throw error;
        }

        // handle redirects
        if (module.redirect !== void 0) {
            return getExports(module.redirect, viaId);
        }

        // handle cross-package linkage
        if (module.mappingRedirect !== void 0) {
            return module.mappingRequire(module.mappingRedirect, viaId);
        }

        // do not reinitialize modules
        if (module.exports !== void 0) {
            return module.exports;
        }

        // do not initialize modules that do not define a factory function
        if (module.factory === void 0) {
            throw new Error(
                "Can't require module " + JSON.stringify(topId) +
                " via " + JSON.stringify(viaId) + " " + JSON.stringify(module)
            );
        }

        module.directory = URL.resolve(module.location, "./"); // EXTENSION
        module.exports = {};

        // Execute the factory function:
        var returnValue = module.factory.call(
            // in the context of the module:
            void 0, // this (defaults to global)
            module.require, // require
            module.exports, // exports
            module, // module
            module.location, // __filename
            module.directory // __dirname
        );

        // EXTENSION
        if (returnValue !== void 0) {
            module.exports = returnValue;
        }

        return module.exports;
    }

    // Finds the internal identifier for a module in a subpackage
    // The `seen` object is a memo of the packages we have seen to avoid
    // infinite recursion of cyclic package dependencies. It also causes
    // the function to return null instead of throwing an exception. I’m
    // guessing that throwing exceptions *and* being recursive would be
    // too much performance evil for one function.
    function identify(id2, require2, seen) {
        var location = config.location;
        if (require2.location === location) {
            return id2;
        }

        var internal = !!seen;
        seen = seen || {};
        if (has(seen, location)) {
            return null; // break the cycle of violence.
        }
        seen[location] = true;
        /*jshint -W089 */
        for (var name in config.mappings) {
            var mapping = config.mappings[name];
            location = mapping.location;
            if (!config.hasPackage(location)) {
                continue;
            }
            var candidate = config.getPackage(location);
            var id1 = candidate.identify(id2, require2, seen);
            if (id1 === null) {
                continue;
            } else if (id1 === "") {
                return name;
            } else {
                return name + "/" + id1;
            }
        }
        if (internal) {
            return null;
        } else {
            throw new Error(
                "Can't identify " + id2 + " from " + require2.location
            );
        }
        /*jshint +W089 */
    }

    // Creates a unique require function for each module that encapsulates
    // that module's id for resolving relative module IDs against.
    function makeRequire(viaId) {

        // Main synchronously executing "require()" function
        var require = function(id) {
            var topId = resolve(id, viaId);
            return getExports(topId, viaId);
        };

        // Asynchronous "require.async()" which ensures async executation
        // (even with synchronous loaders)
        require.async = function(id) {
            var topId = resolve(id, viaId);
            var module = getModuleDescriptor(id);
            return deepLoad(topId, viaId)
            .then(function () {
                return require(topId);
            });
        };

        require.resolve = function (id) {
            return normalize(resolve(id, viaId));
        };

        require.getModule = getModuleDescriptor; // XXX deprecated, use:
        require.getModuleDescriptor = getModuleDescriptor;
        require.lookup = lookup;
        require.load = load;
        require.deepLoad = deepLoad;

        require.loadPackage = function (dependency, givenConfig) {
            if (givenConfig) { // explicit configuration, fresh environment
                return Require.loadPackage(dependency, givenConfig);
            } else { // inherited environment
                return config.loadPackage(dependency, config);
            }
        };

        require.hasPackage = function (dependency) {
            return config.hasPackage(dependency);
        };

        require.getPackage = function (dependency) {
            return config.getPackage(dependency);
        };

        require.isMainPackage = function () {
            return require.location === config.mainPackageLocation;
        };

        require.injectPackageDescription = function (location, description) {
            Require.injectPackageDescription(location, description, config);
        };

        require.injectPackageDescriptionLocation = function (location, descriptionLocation) {
            Require.injectPackageDescriptionLocation(location, descriptionLocation, config);
        };

        require.injectMapping = function (dependency, name) {
            dependency = normalizeDependency(dependency, config, name);
            name = name || dependency.name;
            config.mappings[name] = dependency;
        };

        require.injectDependency = function (name) {
            require.injectMapping({name: name}, name);
        };

        require.identify = identify;
        require.inject = inject;

        config.exposedConfigs.forEach(function(name) {
            require[name] = config[name];
        });

        require.config = config;

        require.read = config.read;

        return require;
    }

    require = makeRequire("");
    return require;
};

Require.injectPackageDescription = function (location, description, config) {
    var descriptions =
        config.descriptions =
            config.descriptions || {};
    descriptions[location] = Q.resolve(description);
};

Require.injectPackageDescriptionLocation = function (location, descriptionLocation, config) {
    var descriptionLocations =
        config.descriptionLocations =
            config.descriptionLocations || {};
    descriptionLocations[location] = descriptionLocation;
};

Require.loadPackageDescription = function (dependency, config) {
    var location = dependency.location;
    var descriptions =
        config.descriptions =
            config.descriptions || {};
    if (descriptions[location] === void 0) {
        var descriptionLocations =
            config.descriptionLocations =
                config.descriptionLocations || {};
        var descriptionLocation;
        if (descriptionLocations[location]) {
            descriptionLocation = descriptionLocations[location];
        } else {
            descriptionLocation = URL.resolve(location, "package.json");
        }
        descriptions[location] = (config.read || Require.read)(descriptionLocation)
        .then(function (json) {
            try {
                return JSON.parse(json);
            } catch (error) {
                error.message = error.message + " in " + JSON.stringify(descriptionLocation);
                throw error;
            }
        });
    }
    return descriptions[location];
};

Require.loadPackage = function (dependency, config) {
    dependency = normalizeDependency(dependency, config);
    if (!dependency.location) {
        throw new Error("Can't find dependency: " + JSON.stringify(dependency));
    }
    var location = dependency.location;
    config = Object.create(config || null);
    var loadingPackages = config.loadingPackages = config.loadingPackages || {};
    var loadedPackages = config.packages = {};
    var registry = config.registry = config.registry || Object.create(null);
    config.mainPackageLocation = location;

    config.hasPackage = function (dependency) {
        dependency = normalizeDependency(dependency, config);
        if (!dependency.location) {
            return false;
        }
        var location = dependency.location;
        return !!loadedPackages[location];
    };

    config.getPackage = function (dependency) {
        dependency = normalizeDependency(dependency, config);
        if (!dependency.location) {
            throw new Error("Can't find dependency: " + JSON.stringify(dependency) + " from " + config.location);
        }
        var location = dependency.location;
        if (!loadedPackages[location]) {
            if (loadingPackages[location]) {
                throw new Error(
                    "Dependency has not finished loading: " + JSON.stringify(dependency)
                );
            } else {
                throw new Error(
                    "Dependency was not loaded: " + JSON.stringify(dependency)
                );
            }
        }
        return loadedPackages[location];
    };

    config.loadPackage = function (dependency, viaConfig, loading) {
        dependency = normalizeDependency(dependency, viaConfig);
        if (!dependency.location) {
            throw new Error("Can't find dependency: " + JSON.stringify(dependency) + " from " + config.location);
        }
        var location = dependency.location;

        // prevent data-lock if there is a package dependency cycle
        loading = loading || {};
        if (loading[location]) {
            // returns an already-fulfilled promise for `undefined`
            return Q();
        }
        loading[location] = true;

        if (!loadingPackages[location]) {

            loadingPackages[location] = Require.loadPackageDescription(dependency, config)
            .then(function (packageDescription) {
                var subconfig = configurePackage(
                    location,
                    packageDescription,
                    config
                );

                subconfig.loadPreprocessorPackage = function () {
                    if (!viaConfig) {
                        return Q(config.preprocessorPackage);
                    } else {
                        return viaConfig.loadPreprocessorPackage()
                        .invoke("loadPackage", dependency);
                    }
                };

                var pkg = Require.makeRequire(subconfig);
                loadedPackages[location] = pkg;
                return Q.all(Object.keys(subconfig.mappings).map(function (prefix) {
                    var dependency = subconfig.mappings[prefix];
                    return config.loadPackage(dependency, subconfig, loading);
                }))
                .then(function () {
                    postConfigurePackage(subconfig, packageDescription);
                })
                .thenResolve(pkg);
            });
            loadingPackages[location].done();
        }
        return loadingPackages[location];
    };

    var pkg = config.loadPackage(dependency);
    pkg.location = location;
    pkg.async = function (id, callback) {
        return pkg.then(function (require) {
            return require.async(id, callback);
        });
    };

    config.hasPreprocessorPackage = !!config.preprocessorPackage;

    return pkg;
};

function normalizeDependency(dependency, config, name) {
    config = config || {};
    if (typeof dependency === "string") {
        dependency = {
            location: dependency
        };
    }
    if (dependency.main) {
        dependency.location = config.mainPackageLocation;
    }
    // if the named dependency has already been found at another
    // location, refer to the same eventual instance
    if (
        dependency.name &&
        config.registry &&
        config.registry[dependency.name]
    ) {
        dependency.location = config.registry[dependency.name];
    }
    // default location
    if (!dependency.location && config.packagesDirectory && dependency.name) {
        dependency.location = URL.resolve(
            config.packagesDirectory,
            dependency.name + "/"
        );
    }
    if (!dependency.location) {
        return dependency; // partially completed
    }
    // make sure the dependency location has a trailing slash so that
    // relative urls will resolve properly
    if (!/\/$/.test(dependency.location)) {
        dependency.location += "/";
    }
    // resolve the location relative to the current package
    if (!Require.isAbsolute(dependency.location)) {
        if (!config.location) {
            throw new Error(
                "Dependency locations must be fully qualified: " +
                JSON.stringify(dependency)
            );
        }
        dependency.location = URL.resolve(
            config.location,
            dependency.location
        );
    }
    // register the package name so the location can be reused
    if (dependency.name) {
        config.registry[dependency.name] = dependency.location;
    }
    return dependency;
}

function configurePackage(location, description, parent) {

    if (!/\/$/.test(location)) {
        location += "/";
    }

    var config = Object.create(parent);
    config.parent = parent;
    config.name = description.name;
    config.location = location || Require.getLocation();
    config.packageDescription = description;
    config.useScriptInjection = description.useScriptInjection;

    if (description.production !== void 0) {
        config.production = description.production;
    }

    // explicitly mask definitions and modules, which must
    // not apply to child packages
    var modules = config.modules = config.modules || {};

    var registry = config.registry;
    if (config.name !== void 0 && !registry[config.name]) {
        registry[config.name] = config.location;
    }

    // overlay
    var overlay = description.overlay || {};

    // but first, convert "browser" field, as pioneered by Browserify, to an
    // overlay
    if (typeof description.browser === "string") {
        overlay.browser = {
            redirects: {"": description.browser}
        };
    } else if (typeof description.browser === "object") {
        overlay.browser = {
            redirects: description.browser
        };
    }

    // overlay continued...
    var layer;
    (config.overlays || Require.overlays).forEach(function (engine) {
        /*jshint -W089 */
        if (overlay[engine]) {
            var layer = overlay[engine];
            merge(description, layer);
        }
        /*jshint +W089 */
    });
    delete description.overlay;

    config.packagesDirectory = URL.resolve(location, "node_modules/");

    // The default "main" module of a package has the same name as the
    // package.
    if (description.main !== void 0) {

        // main, injects a definition for the main module, with
        // only its path. makeRequire goes through special effort
        // in deepLoad to re-initialize this definition with the
        // loaded definition from the given path.
        modules[""] = {
            id: "",
            redirect: normalize(resolve(description.main, "")),
            location: config.location
        };

    }

    // Deal with redirects
    var redirects = description.redirects;
    if (redirects !== void 0) {
        Object.keys(redirects).forEach(function (name) {
            modules[name] = {
                id: name,
                redirect: normalize(resolve(redirects[name], "")),
                location: URL.resolve(location, name)
            };
        });
    }

    // mappings, link this package to other packages.
    var mappings = description.mappings || {};
    // dependencies, devDependencies if not in production, if not installed by NPM
    [
        description.dependencies,
        description._id || description.production ?
            null :
            description.devDependencies
    ]
    .forEach(function (dependencies) {
        if (!dependencies) {
            return;
        }
        Object.keys(dependencies).forEach(function (name) {
            if (!mappings[name]) {
                // dependencies are equivalent to name and version mappings,
                // though the version predicate string is presently ignored
                // (TODO)
                mappings[name] = {
                    name: name,
                    version: dependencies[name]
                };
            }
        });
    });
    // mappings
    Object.keys(mappings).forEach(function (name) {
        mappings[name] = normalizeDependency(
            mappings[name],
            config,
            name
        );
    });
    config.mappings = mappings;

    // per-extension configuration
    config.optimizers = description.optimizers;
    config.compilers = description.compilers;
    config.translators = description.translators;

    return config;
}

function postConfigurePackage(config, description) {
    var mappings = config.mappings;
    var prefixes = Object.keys(mappings);
    var redirectTable = config.redirectTable = config.redirectTable || [];
    prefixes.forEach(function (prefix) {

        var dependency = mappings[prefix];
        if (!config.hasPackage(dependency)) {
            return;
        }
        var package = config.getPackage(dependency);
        var extensions;

        // reference optimizers
        var myOptimizers = config.optimizers = config.optimizers || {};
        var theirOptimizers = package.config.optimizers;
        extensions = Object.keys(theirOptimizers);
        extensions.forEach(function (extension) {
            myOptimizers[extension] = prefix + "/" + theirOptimizers[extension];
        });

        // reference translators
        var myTranslators = config.translators = config.translators || {};
        var theirTranslators = package.config.translators;
        extensions = Object.keys(theirTranslators);
        extensions.forEach(function (extension) {
            myTranslators[extension] = prefix + "/" + theirTranslators[extension];
        });

        // reference compilers
        var myCompilers = config.compilers = config.compilers || {};
        var theirCompilers = package.config.compilers;
        extensions = Object.keys(theirCompilers);
        extensions.forEach(function (extension) {
            myCompilers[extension] = prefix + "/" + theirCompilers[extension];
        });

        // copy redirect patterns
        redirectTable.push.apply(
            redirectTable,
            package.config.redirectTable
        );

    });

    if (description["redirect-patterns"]) {
        var describedPatterns = description["redirect-patterns"];
        for (var pattern in describedPatterns) {
            if (has(describedPatterns, pattern)) {
                redirectTable.push([
                    new RegExp(pattern),
                    describedPatterns[pattern]
                ]);
            }
        }
    }
}

function merge(target, source) {
    for (var name in source) {
        if (has(source, name)) {
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

Require.exposedConfigs = [
    "location",
    "packageDescription",
    "packages",
    "modules"
];

// Built-in compiler/preprocessor "middleware":

Require.makeCompiler = function(config) {
    return Require.JsonCompiler(
        config,
        Require.LintCompiler(
            config,
            Require.Compiler(config)
        )
    );
};

Require.JsonCompiler = function (config, compile) {
    return function (module) {
        var json = (module.location || "").match(/\.json$/);
        if (json) {
            module.exports = JSON.parse(module.text);
            return module;
        } else {
            return compile(module);
        }
    };
};

Require.LintCompiler = function(config, compile) {
    return function(module) {
        try {
            compile(module);
        } catch (error) {
            if (config.lint) {
                // TODO: use ASAP
                Q.nextTick(function () {
                    config.lint(module);
                });
            }
            throw error;
        }
    };
};

// Built-in loader "middleware":

Require.CommonLoader = function (config, load) {
    return Require.MappingsLoader(
        config,
        Require.RedirectPatternsLoader(
            config,
            Require.LocationLoader(
                config,
                Require.MemoizedLoader(
                    config,
                    load
                )
            )
        )
    );
};

// Using mappings hash to load modules that match a mapping.
Require.MappingsLoader = function(config, load) {
    config.mappings = config.mappings || {};
    config.name = config.name;

    // finds a mapping to follow, if any
    return function (id, module) {
        var mappings = config.mappings;
        var prefixes = Object.keys(mappings);
        var length = prefixes.length;

        if (Require.isAbsolute(id)) {
            return load(id, module);
        }
        var i, prefix;
        for (i = 0; i < length; i++) {
            prefix = prefixes[i];
            if (
                id === prefix ||
                id.indexOf(prefix) === 0 &&
                id.charAt(prefix.length) === "/"
            ) {
                /*jshint -W083 */
                var mapping = mappings[prefix];
                var rest = id.slice(prefix.length + 1);
                return config.loadPackage(mapping, config)
                .then(function (mappingRequire) {
                    /*jshint +W083 */
                    module.mappingRedirect = rest;
                    module.mappingRequire = mappingRequire;
                    return mappingRequire.deepLoad(rest, config.location);
                });
            }
        }
        return load(id, module);
    };
};

Require.RedirectPatternsLoader = function (config, load) {
    return function (id, module) {
        var table = config.redirectTable || [];
        for (var i = 0; i < table.length; i++) {
            var expression = table[i][0];
            var match = expression.exec(id);
            if (match) {
                var replacement = table[i][1];
                module.redirect = id.replace(expression, replacement);
                return;
            }
        }
        return load(id, module);
    };
};

Require.LocationLoader = function (config, load) {
    return function (id, module) {
        var base = id;
        var extension = module.extension;
        if (
            !has(config.optimizers, extension) &&
            !has(config.translators, extension) &&
            !has(config.compilers, extension) &&
            extension !== "js" &&
            extension !== "json"
        ) {
            base += ".js";
        }
        var location = URL.resolve(config.location, base);
        return load(location, module);
    };
};

Require.MemoizedLoader = function (config, load) {
    var cache = config.cache = config.cache || {};
    return memoize(load, cache);
};

// Helper functions:

// Resolves CommonJS module IDs (not paths)
Require.resolve = resolve;
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

Require.normalize = normalize;
function normalize(id) {
    var match = /^(.*)\.js$/.exec(id);
    if (match) {
        id = match[1];
    }
    return id;
}

Require.extension = extension;
function extension(location) {
    var match = /\.([^\/\.]+)$/.exec(location);
    if (match) {
        return match[1];
    }
}

// Tests whether the location or URL is a absolute.
Require.isAbsolute = isAbsolute;
function isAbsolute(location) {
    return (/^[\w\-]+:/).test(location);
}

// Extracts dependencies by parsing code and looking for "require" (currently
// using a simple regexp)
Require.parseDependencies = parseDependencies;
function parseDependencies(text) {
    var o = {};
    String(text).replace(/(?:^|[^\w\$_.])require\s*\(\s*["']([^"']*)["']\s*\)/g, function(_, id) {
        o[id] = true;
    });
    return Object.keys(o);
}

function has(object, property) {
    return Object.prototype.hasOwnProperty.call(object, property);
}

function memoize(callback, cache) {
    cache = cache || {};
    return function (key, arg) {
        if (!has(cache, key)) {
            cache[key] = Q(callback).call(void 0, key, arg);
        }
        return cache[key];
    };
}

}],["mr","mini-url",{},function (require, exports, module){

// mr mini-url
// -----------


// This is the browser implementation for "mr/url",
// redirected from "url" within the Mr package by the Montage Require
// loader because of the "browser" redirects in package.json.

// This is a very small subset of the Node.js URL module, suitable only for
// resolving relative module identifiers relative to fully qualified base
// URL’s.
// Because Montage Require only needs this part of the URL module, a
// very compact implementation is possible, teasing the necessary behavior out
// of the browser's own URL resolution mechanism, even though at time of
// writing, browsers do not provide an explicit JavaScript interface.

// The implementation takes advantage of the "href" getter/setter on an "a"
// (anchor) tag in the presence of a "base" tag on the document.
// We either use an existing "base" tag or temporarily introduce a fake
// "base" tag into the header of the page.
// We then temporarily modify the "href" of the base tag to be the base URL
// for the duration of a call to URL.resolve, to be the base URL argument.
// We then apply the relative URL to the "href" setter of an anchor tag,
// and read back the absolute URL from the "href" getter.
// The browser guarantees that the "href" property will report the fully
// qualified URL relative to the page's location, albeit its "base" location.

var head = document.querySelector("head"),
    baseElement = document.createElement("base"),
    relativeElement = document.createElement("a");

baseElement.href = "";

exports.resolve = function resolve(base, relative) {
    var currentBaseElement = head.querySelector("base");
    if (!currentBaseElement) {
        head.appendChild(baseElement);
        currentBaseElement = baseElement;
    }
    base = String(base);
    if (!/^[\w\-]+:/.test(base)) { // isAbsolute(base)
        throw new Error("Can't resolve from a relative location: " + JSON.stringify(base) + " " + JSON.stringify(relative));
    }
    var restore = currentBaseElement.href;
    currentBaseElement.href = base;
    relativeElement.href = relative;
    var resolved = relativeElement.href;
    currentBaseElement.href = restore;
    if (currentBaseElement === baseElement) {
        head.removeChild(currentBaseElement);
    }
    return resolved;
};

}],["mr","script",{},function (require, exports, module){

// mr script
// ---------


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

}],["q","q",{"collections/shim":6,"collections/weak-map":17,"collections/iterator":5,"asap":1},function (require, exports, module){

// q q
// ---

// vim:ts=4:sts=4:sw=4:
/*!
 *
 * Copyright 2009-2013 Kris Kowal under the terms of the MIT
 * license found at http://github.com/kriskowal/q/raw/master/LICENSE
 *
 * With parts by Tyler Close
 * Copyright 2007-2009 Tyler Close under the terms of the MIT X license found
 * at http://www.opensource.org/licenses/mit-license.html
 * Forked at ref_send.js version: 2009-05-11
 *
 * With parts by Mark Miller
 * Copyright (C) 2011 Google Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 */
/*global -WeakMap */
"use strict";

var hasStacks = false;
try {
    throw new Error();
} catch (e) {
    hasStacks = !!e.stack;
}

// All code after this point will be filtered from stack traces reported
// by Q.
var qStartingLine = captureLine();
var qFileName;

require("collections/shim");
var WeakMap = require("collections/weak-map");
var Iterator = require("collections/iterator");
var asap = require("asap");

function isObject(value) {
    return value === Object(value);
}

// long stack traces

var STACK_JUMP_SEPARATOR = "From previous event:";

function makeStackTraceLong(error, promise) {
    // If possible, transform the error stack trace by removing Node and Q
    // cruft, then concatenating with the stack trace of `promise`. See #57.
    if (hasStacks &&
        promise.stack &&
        typeof error === "object" &&
        error !== null &&
        error.stack &&
        error.stack.indexOf(STACK_JUMP_SEPARATOR) === -1
    ) {
        var stacks = [];
        for (var p = promise; !!p && handlers.get(p); p = handlers.get(p).became) {
            if (p.stack) {
                stacks.unshift(p.stack);
            }
        }
        stacks.unshift(error.stack);

        var concatedStacks = stacks.join("\n" + STACK_JUMP_SEPARATOR + "\n");
        error.stack = filterStackString(concatedStacks);
    }
}

function filterStackString(stackString) {
    if (Q.isIntrospective) {
        return stackString;
    }
    var lines = stackString.split("\n");
    var desiredLines = [];
    for (var i = 0; i < lines.length; ++i) {
        var line = lines[i];

        if (!isInternalFrame(line) && !isNodeFrame(line) && line) {
            desiredLines.push(line);
        }
    }
    return desiredLines.join("\n");
}

function isNodeFrame(stackLine) {
    return stackLine.indexOf("(module.js:") !== -1 ||
           stackLine.indexOf("(node.js:") !== -1;
}

function getFileNameAndLineNumber(stackLine) {
    // Named functions: "at functionName (filename:lineNumber:columnNumber)"
    // In IE10 function name can have spaces ("Anonymous function") O_o
    var attempt1 = /at .+ \((.+):(\d+):(?:\d+)\)$/.exec(stackLine);
    if (attempt1) {
        return [attempt1[1], Number(attempt1[2])];
    }

    // Anonymous functions: "at filename:lineNumber:columnNumber"
    var attempt2 = /at ([^ ]+):(\d+):(?:\d+)$/.exec(stackLine);
    if (attempt2) {
        return [attempt2[1], Number(attempt2[2])];
    }

    // Firefox style: "function@filename:lineNumber or @filename:lineNumber"
    var attempt3 = /.*@(.+):(\d+)$/.exec(stackLine);
    if (attempt3) {
        return [attempt3[1], Number(attempt3[2])];
    }
}

function isInternalFrame(stackLine) {
    var fileNameAndLineNumber = getFileNameAndLineNumber(stackLine);

    if (!fileNameAndLineNumber) {
        return false;
    }

    var fileName = fileNameAndLineNumber[0];
    var lineNumber = fileNameAndLineNumber[1];

    return fileName === qFileName &&
        lineNumber >= qStartingLine &&
        lineNumber <= qEndingLine;
}

// discover own file name and line number range for filtering stack
// traces
function captureLine() {
    if (!hasStacks) {
        return;
    }

    try {
        throw new Error();
    } catch (e) {
        var lines = e.stack.split("\n");
        var firstLine = lines[0].indexOf("@") > 0 ? lines[1] : lines[2];
        var fileNameAndLineNumber = getFileNameAndLineNumber(firstLine);
        if (!fileNameAndLineNumber) {
            return;
        }

        qFileName = fileNameAndLineNumber[0];
        return fileNameAndLineNumber[1];
    }
}

function deprecate(callback, name, alternative) {
    return function Q_deprecate() {
        if (
            typeof console !== "undefined" &&
            typeof console.warn === "function"
        ) {
            if (alternative) {
                console.warn(
                    name + " is deprecated, use " + alternative + " instead.",
                    new Error("").stack
                );
            } else {
                console.warn(
                    name + " is deprecated.",
                    new Error("").stack
                );
            }
        }
        return callback.apply(this, arguments);
    };
}

// end of long stack traces

var handlers = new WeakMap();

function Q_inspect(promise) {
    var handler = handlers.get(promise);
    if (!handler || !handler.became) {
        return handler;
    }
    handler = follow(handler);
    handlers.set(promise, handler);
    return handler;
}

function follow(handler) {
    if (!handler.became) {
        return handler;
    } else {
        handler.became = follow(handler.became);
        return handler.became;
    }
}

var theViciousCycleError = new Error("Can't resolve a promise with itself");
var theViciousCycleRejection = Q_reject(theViciousCycleError);
var theViciousCycle = Q_inspect(theViciousCycleRejection);

var thenables = new WeakMap();

/**
 * Coerces a value to a promise. If the value is a promise, pass it through
 * unaltered. If the value has a `then` method, it is presumed to be a promise
 * but not one of our own, so it is treated as a “thenable” promise and this
 * returns a promise that stands for it. Otherwise, this returns a promise that
 * has already been fulfilled with the value.
 * @param value promise, object with a then method, or a fulfillment value
 * @returns {Promise} the same promise as given, or a promise for the given
 * value
 */
module.exports = Q;
function Q(value) {
    // If the object is already a Promise, return it directly.  This enables
    // the resolve function to both be used to created references from objects,
    // but to tolerably coerce non-promises to promises.
    if (Q_isPromise(value)) {
        return value;
    } else if (isThenable(value)) {
        if (!thenables.has(value)) {
            thenables.set(value, new Promise(new Thenable(value)));
        }
        return thenables.get(value);
    } else {
        return new Promise(new Fulfilled(value));
    }
}

/**
 * Controls whether or not long stack traces will be on
 * @type {boolean}
 */
Q.longStackSupport = false;

/**
 * Returns a promise that has been rejected with a reason, which should be an
 * instance of `Error`.
 * @param {Error} error reason for the failure.
 * @returns {Promise} rejection
 */
Q.reject = Q_reject;
function Q_reject(error) {
    return new Promise(new Rejected(error));
}

/**
 * Constructs a {promise, resolve, reject} object.
 *
 * `resolve` is a callback to invoke with a more resolved value for the
 * promise. To fulfill the promise, invoke `resolve` with any value that is
 * not a thenable. To reject the promise, invoke `resolve` with a rejected
 * thenable, or invoke `reject` with the reason directly. To resolve the
 * promise to another thenable, thus putting it in the same state, invoke
 * `resolve` with that other thenable.
 *
 * @returns {{promise, resolve, reject}} a deferred
 */
Q.defer = defer;
function defer() {

    var handler = new Pending();
    var promise = new Promise(handler);
    var deferred = new Deferred(promise);

    if (Q.longStackSupport && hasStacks) {
        try {
            throw new Error();
        } catch (e) {
            // NOTE: don't try to use `Error.captureStackTrace` or transfer the
            // accessor around; that causes memory leaks as per GH-111. Just
            // reify the stack trace as a string ASAP.
            //
            // At the same time, cut off the first line; it's always just
            // "[object Promise]\n", as per the `toString`.
            promise.stack = e.stack.substring(e.stack.indexOf("\n") + 1);
        }
    }

    return deferred;
}

// TODO
/**
 */
Q.when = function Q_when(value, fulfilled, rejected, ms) {
    return Q(value).then(fulfilled, rejected, ms);
};

/**
 * Turns an array of promises into a promise for an array.  If any of the
 * promises gets rejected, the whole array is rejected immediately.
 * @param {Array.<Promise>} an array (or promise for an array) of values (or
 * promises for values)
 * @returns {Promise.<Array>} a promise for an array of the corresponding values
 */
// By Mark Miller
// http://wiki.ecmascript.org/doku.php?id=strawman:concurrency&rev=1308776521#allfulfilled
Q.all = Q_all;
function Q_all(questions) {
    // XXX deprecated behavior
    if (Q_isPromise(questions)) {
        if (
            typeof console !== "undefined" &&
            typeof console.warn === "function"
        ) {
            console.warn("Q.all no longer directly unwraps a promise. Use Q(array).all()");
        }
        return Q(questions).all();
    }
    var countDown = 0;
    var deferred = defer();
    var answers = Array(questions.length);
    var estimates = [];
    var estimate = -Infinity;
    var setEstimate;
    Array.prototype.forEach.call(questions, function Q_all_each(promise, index) {
        var handler;
        if (
            Q_isPromise(promise) &&
            (handler = Q_inspect(promise)).state === "fulfilled"
        ) {
            answers[index] = handler.value;
        } else {
            ++countDown;
            promise = Q(promise);
            promise.then(
                function Q_all_eachFulfilled(value) {
                    answers[index] = value;
                    if (--countDown === 0) {
                        deferred.resolve(answers);
                    }
                },
                deferred.reject
            );

            promise.observeEstimate(function Q_all_eachEstimate(newEstimate) {
                var oldEstimate = estimates[index];
                estimates[index] = newEstimate;
                if (newEstimate > estimate) {
                    estimate = newEstimate;
                } else if (oldEstimate === estimate && newEstimate <= estimate) {
                    // There is a 1/length chance that we will need to perform
                    // this O(length) walk, so amortized O(1)
                    computeEstimate();
                }
                if (estimates.length === questions.length && estimate !== setEstimate) {
                    deferred.setEstimate(estimate);
                    setEstimate = estimate;
                }
            });

        }
    });

    function computeEstimate() {
        estimate = -Infinity;
        for (var index = 0; index < estimates.length; index++) {
            if (estimates[index] > estimate) {
                estimate = estimates[index];
            }
        }
    }

    if (countDown === 0) {
        deferred.resolve(answers);
    }

    return deferred.promise;
}

/**
 * @see Promise#allSettled
 */
Q.allSettled = Q_allSettled;
function Q_allSettled(questions) {
    // XXX deprecated behavior
    if (Q_isPromise(questions)) {
        if (
            typeof console !== "undefined" &&
            typeof console.warn === "function"
        ) {
            console.warn("Q.allSettled no longer directly unwraps a promise. Use Q(array).allSettled()");
        }
        return Q(questions).allSettled();
    }
    return Q_all(questions.map(function Q_allSettled_each(promise) {
        promise = Q(promise);
        function regardless() {
            return promise.inspect();
        }
        return promise.then(regardless, regardless);
    }));
}

/**
 * Returns a promise for the given value (or promised value), some
 * milliseconds after it resolved. Passes rejections immediately.
 * @param {Any*} promise
 * @param {Number} milliseconds
 * @returns a promise for the resolution of the given promise after milliseconds
 * time has elapsed since the resolution of the given promise.
 * If the given promise rejects, that is passed immediately.
 */
Q.delay = function Q_delay(object, timeout) {
    if (timeout === void 0) {
        timeout = object;
        object = void 0;
    }
    return Q(object).delay(timeout);
};

/**
 * Causes a promise to be rejected if it does not get fulfilled before
 * some milliseconds time out.
 * @param {Any*} promise
 * @param {Number} milliseconds timeout
 * @param {String} custom error message (optional)
 * @returns a promise for the resolution of the given promise if it is
 * fulfilled before the timeout, otherwise rejected.
 */
Q.timeout = function Q_timeout(object, ms, message) {
    return Q(object).timeout(ms, message);
};

/**
 * Spreads the values of a promised array of arguments into the
 * fulfillment callback.
 * @param fulfilled callback that receives variadic arguments from the
 * promised array
 * @param rejected callback that receives the exception if the promise
 * is rejected.
 * @returns a promise for the return value or thrown exception of
 * either callback.
 */
Q.spread = Q_spread;
function Q_spread(value, fulfilled, rejected) {
    return Q(value).spread(fulfilled, rejected);
}

/**
 * If two promises eventually fulfill to the same value, promises that value,
 * but otherwise rejects.
 * @param x {Any*}
 * @param y {Any*}
 * @returns {Any*} a promise for x and y if they are the same, but a rejection
 * otherwise.
 *
 */
Q.join = function Q_join(x, y) {
    return Q.spread([x, y], function Q_joined(x, y) {
        if (x === y) {
            // TODO: "===" should be Object.is or equiv
            return x;
        } else {
            throw new Error("Can't join: not the same: " + x + " " + y);
        }
    });
};

/**
 * Returns a promise for the first of an array of promises to become fulfilled.
 * @param answers {Array} promises to race
 * @returns {Promise} the first promise to be fulfilled
 */
Q.race = Q_race;
function Q_race(answerPs) {
    return new Promise(function(deferred) {
        answerPs.forEach(function(answerP) {
            Q(answerP).then(deferred.resolve, deferred.reject);
        });
    });
}

/**
 * Calls the promised function in a future turn.
 * @param object    promise or immediate reference for target function
 * @param ...args   array of application arguments
 */
Q.try = function Q_try(callback) {
    return Q(callback).dispatch("call", [[]]);
};

/**
 * TODO
 */
Q.function = Promise_function;
function Promise_function(wrapped) {
    return function promiseFunctionWrapper() {
        var args = new Array(arguments.length);
        for (var index = 0; index < arguments.length; index++) {
            args[index] = arguments[index];
        }
        return Q(wrapped).apply(this, args);
    };
}

/**
 * The promised function decorator ensures that any promise arguments
 * are settled and passed as values (`this` is also settled and passed
 * as a value).  It will also ensure that the result of a function is
 * always a promise.
 *
 * @example
 * var add = Q.promised(function (a, b) {
 *     return a + b;
 * });
 * add(Q(a), Q(B));
 *
 * @param {function} callback The function to decorate
 * @returns {function} a function that has been decorated.
 */
Q.promised = function Q_promised(callback) {
    return function promisedMethod() {
        var args = new Array(arguments.length);
        for (var index = 0; index < arguments.length; index++) {
            args[index] = arguments[index];
        }
        return Q_spread(
            [this, Q_all(args)],
            function Q_promised_spread(self, args) {
                return callback.apply(self, args);
            }
        );
    };
};

/**
 */
Q.passByCopy = // TODO XXX experimental
Q.push = function (value) {
    if (Object(value) === value && !Q_isPromise(value)) {
        passByCopies.set(value, true);
    }
    return value;
};

Q.isPortable = function (value) {
    return Object(value) === value && passByCopies.has(value);
};

var passByCopies = new WeakMap();

/**
 * The async function is a decorator for generator functions, turning
 * them into asynchronous generators. Although generators are only
 * part of the newest ECMAScript 6 drafts, this code does not cause
 * syntax errors in older engines. This code should continue to work
 * and will in fact improve over time as the language improves.
 *
 * ES6 generators are currently part of V8 version 3.19 with the
 * `--harmony-generators` runtime flag enabled. This function does not
 * support the former, Pythonic generators that were only implemented
 * by SpiderMonkey.
 *
 * Decorates a generator function such that:
 *  - it may yield promises
 *  - execution will continue when that promise is fulfilled
 *  - the value of the yield expression will be the fulfilled value
 *  - it returns a promise for the return value (when the generator
 *    stops iterating)
 *  - the decorated function returns a promise for the return value
 *    of the generator or the first rejected promise among those
 *    yielded.
 *  - if an error is thrown in the generator, it propagates through
 *    every following yield until it is caught, or until it escapes
 *    the generator function altogether, and is translated into a
 *    rejection for the promise returned by the decorated generator.
 */
Q.async = Q_async;
function Q_async(makeGenerator) {
    return function spawn() {
        // when verb is "send", arg is a value
        // when verb is "throw", arg is an exception
        function continuer(verb, arg) {
            var iteration;
            try {
                iteration = generator[verb](arg);
            } catch (exception) {
                return Q_reject(exception);
            }
            if (iteration.done) {
                return Q(iteration.value);
            } else {
                return Q(iteration.value).then(callback, errback);
            }
        }
        var generator = makeGenerator.apply(this, arguments);
        var callback = continuer.bind(continuer, "next");
        var errback = continuer.bind(continuer, "throw");
        return callback();
    };
}

/**
 * The spawn function is a small wrapper around async that immediately
 * calls the generator and also ends the promise chain, so that any
 * unhandled errors are thrown instead of forwarded to the error
 * handler. This is useful because it's extremely common to run
 * generators at the top-level to work with libraries.
 */
Q.spawn = Q_spawn;
function Q_spawn(makeGenerator) {
    Q_async(makeGenerator)().done();
}


// Thus begins the section dedicated to the Promise

/**
 * TODO
 */
Q.Promise = Promise;
function Promise(handler) {
    if (!(this instanceof Promise)) {
        return new Promise(handler);
    }
    if (typeof handler === "function") {
        var setup = handler;
        var deferred = defer();
        handler = Q_inspect(deferred.promise);
        try {
            setup(deferred.resolve, deferred.reject, deferred.setEstimate);
        } catch (error) {
            deferred.reject(error);
        }
    }
    handlers.set(this, handler);
}

/**
 * Turns an array of promises into a promise for an array.  If any of the
 * promises gets rejected, the whole array is rejected immediately.
 * @param {Array.<Promise>} an array (or promise for an array) of values (or
 * promises for values)
 * @returns {Promise.<Array>} a promise for an array of the corresponding values
 */
Promise.all = Q_all;

/**
 * Returns a promise for the first of an array of promises to become fulfilled.
 * @param answers {Array} promises to race
 * @returns {Promise} the first promise to be fulfilled
 */
Promise.race = Q_race;

/**
 * Coerces a value to a promise. If the value is a promise, pass it through
 * unaltered. If the value has a `then` method, it is presumed to be a promise
 * but not one of our own, so it is treated as a “thenable” promise and this
 * returns a promise that stands for it. Otherwise, this returns a promise that
 * has already been fulfilled with the value.
 * @param value promise, object with a then method, or a fulfillment value
 * @returns {Promise} the same promise as given, or a promise for the given
 * value
 */
Promise.resolve = Promise_resolve;
function Promise_resolve(value) {
    return Q(value);
}

/**
 * Returns a promise that has been rejected with a reason, which should be an
 * instance of `Error`.
 * @param reason value describing the failure
 * @returns {Promise} rejection
 */
Promise.reject = Q_reject;

/**
 * @returns {boolean} whether the given value is a promise.
 */
Q.isPromise = Q_isPromise;
function Q_isPromise(object) {
    return isObject(object) && !!handlers.get(object);
}

/**
 * @returns {boolean} whether the given value is an object with a then method.
 * @private
 */
function isThenable(object) {
    return isObject(object) && typeof object.then === "function";
}

/**
 * Synchronously produces a snapshot of the internal state of the promise.  The
 * object will have a `state` property. If the `state` is `"pending"`, there
 * will be no further information. If the `state` is `"fulfilled"`, there will
 * be a `value` property. If the state is `"rejected"` there will be a `reason`
 * property.  If the promise was constructed from a “thenable” and `then` nor
 * any other method has been dispatched on the promise has been called, the
 * state will be `"pending"`. The state object will not be updated if the
 * state changes and changing it will have no effect on the promise. Every
 * call to `inspect` produces a unique object.
 * @returns {{state: string, value?, reason?}}
 */
Promise.prototype.inspect = function Promise_inspect() {
    // the second layer captures only the relevant "state" properties of the
    // handler to prevent leaking the capability to access or alter the
    // handler.
    return Q_inspect(this).inspect();
};

/**
 * @returns {boolean} whether the promise is waiting for a result.
 */
Promise.prototype.isPending = function Promise_isPending() {
    return Q_inspect(this).state === "pending";
};

/**
 * @returns {boolean} whether the promise has ended in a result and has a
 * fulfillment value.
 */
Promise.prototype.isFulfilled = function Promise_isFulfilled() {
    return Q_inspect(this).state === "fulfilled";
};

/**
 * @returns {boolean} whether the promise has ended poorly and has a reason for
 * its rejection.
 */
Promise.prototype.isRejected = function Promise_isRejected() {
    return Q_inspect(this).state === "rejected";
};

/**
 * @returns {string} merely `"[object Promise]"`
 */
Promise.prototype.toString = function Promise_toString() {
    return "[object Promise]";
};

/**
 * Creates a new promise, waits for this promise to be resolved, and informs
 * either the fullfilled or rejected handler of the result. Whatever result
 * comes of the fulfilled or rejected handler, a value returned, a promise
 * returned, or an error thrown, becomes the resolution for the promise
 * returned by `then`.
 *
 * @param fulfilled
 * @param rejected
 * @returns {Promise} for the result of `fulfilled` or `rejected`.
 */
Promise.prototype.then = function Promise_then(fulfilled, rejected, ms) {
    var self = this;
    var deferred = defer();

    var _fulfilled;
    if (typeof fulfilled === "function") {
        _fulfilled = function Promise_then_fulfilled(value) {
            try {
                deferred.resolve(fulfilled.call(void 0, value));
            } catch (error) {
                deferred.reject(error);
            }
        };
    } else {
        _fulfilled = deferred.resolve;
    }

    var _rejected;
    if (typeof rejected === "function") {
        _rejected = function Promise_then_rejected(error) {
            try {
                deferred.resolve(rejected.call(void 0, error));
            } catch (newError) {
                deferred.reject(newError);
            }
        };
    } else {
        _rejected = deferred.reject;
    }

    this.done(_fulfilled, _rejected);

    if (ms !== void 0) {
        var updateEstimate = function Promise_then_updateEstimate() {
            deferred.setEstimate(self.getEstimate() + ms);
        };
        this.observeEstimate(updateEstimate);
        updateEstimate();
    }

    return deferred.promise;
};

/**
 * Terminates a chain of promises, forcing rejections to be
 * thrown as exceptions.
 * @param fulfilled
 * @param rejected
 */
Promise.prototype.done = function Promise_done(fulfilled, rejected) {
    var self = this;
    var done = false;   // ensure the untrusted promise makes at most a
                        // single call to one of the callbacks
    asap(function Promise_done_task() {
        var _fulfilled;
        if (typeof fulfilled === "function") {
            if (Q.onerror) {
                _fulfilled = function Promise_done_fulfilled(value) {
                    if (done) {
                        return;
                    }
                    done = true;
                    try {
                        fulfilled.call(void 0, value);
                    } catch (error) {
                        // fallback to rethrow is still necessary because
                        // _fulfilled is not called in the same event as the
                        // above guard.
                        (Q.onerror || Promise_rethrow)(error);
                    }
                };
            } else {
                _fulfilled = function Promise_done_fulfilled(value) {
                    if (done) {
                        return;
                    }
                    done = true;
                    fulfilled.call(void 0, value);
                };
            }
        }

        var _rejected;
        if (typeof rejected === "function" && Q.onerror) {
            _rejected = function Promise_done_rejected(error) {
                if (done) {
                    return;
                }
                done = true;
                makeStackTraceLong(error, self);
                try {
                    rejected.call(void 0, error);
                } catch (newError) {
                    (Q.onerror || Promise_rethrow)(newError);
                }
            };
        } else if (typeof rejected === "function") {
            _rejected = function Promise_done_rejected(error) {
                if (done) {
                    return;
                }
                done = true;
                makeStackTraceLong(error, self);
                rejected.call(void 0, error);
            };
        } else {
            _rejected = Q.onerror || Promise_rethrow;
        }

        if (typeof process === "object" && process.domain) {
            _rejected = process.domain.bind(_rejected);
        }

        Q_inspect(self).dispatch(_fulfilled, "then", [_rejected]);
    });
};

function Promise_rethrow(error) {
    throw error;
}

/**
 * TODO
 */
Promise.prototype.thenResolve = function Promise_thenResolve(value) {
    // Wrapping ahead of time to forestall multiple wrappers.
    value = Q(value);
    // Using all is necessary to aggregate the estimated time to completion.
    return Q_all([this, value]).then(function Promise_thenResolve_resolved() {
        return value;
    }, null, 0);
    // 0: does not contribute significantly to the estimated time to
    // completion.
};

/**
 * TODO
 */
Promise.prototype.thenReject = function Promise_thenReject(error) {
    return this.then(function Promise_thenReject_resolved() {
        throw error;
    }, null, 0);
    // 0: does not contribute significantly to the estimated time to
    // completion.
};

/**
 * TODO
 */
Promise.prototype.all = function Promise_all() {
    return this.then(Q_all);
};

/**
 * Turns an array of promises into a promise for an array of their states (as
 * returned by `inspect`) when they have all settled.
 * @param {Array[Any*]} values an array (or promise for an array) of values (or
 * promises for values)
 * @returns {Array[State]} an array of states for the respective values.
 */
Promise.prototype.allSettled = function Promise_allSettled() {
    return this.then(Q_allSettled);
};

/**
 * TODO
 */
Promise.prototype.catch = function Promise_catch(rejected) {
    return this.then(void 0, rejected);
};

/**
 * TODO
 */
Promise.prototype.finally = function Promise_finally(callback, ms) {
    if (!callback) {
        return this;
    }
    callback = Q(callback);
    return this.then(function (value) {
        return callback.call().then(function Promise_finally_fulfilled() {
            return value;
        });
    }, function (reason) {
        // TODO attempt to recycle the rejection with "this".
        return callback.call().then(function Promise_finally_rejected() {
            throw reason;
        });
    }, ms);
};

/**
 * TODO
 */
Promise.prototype.observeEstimate = function Promise_observeEstimate(emit) {
    this.dispatch("estimate", [emit]);
    return this;
};

/**
 * TODO
 */
Promise.prototype.getEstimate = function Promise_getEstimate() {
    return Q_inspect(this).estimate;
};

/**
 * TODO
 */
Promise.prototype.dispatch = function Promise_dispatch(op, args) {
    var deferred = defer();
    this.rawDispatch(deferred.resolve, op, args);
    return deferred.promise;
};

/**
 */
Promise.prototype.rawDispatch = function Promise_rawDispatch(resolve, op, args) {
    var self = this;
    asap(function Promise_dispatch_task() {
        Q_inspect(self).dispatch(resolve, op, args);
    });
};

/**
 * TODO
 */
Promise.prototype.get = function Promise_get(key) {
    return this.dispatch("get", [key]);
};

/**
 * TODO
 */
Promise.prototype.invoke = function Promise_invoke(name /*...args*/) {
    var args = new Array(arguments.length - 1);
    for (var index = 1; index < arguments.length; index++) {
        args[index - 1] = arguments[index];
    }
    return this.dispatch("invoke", [name, args]);
};

/**
 * TODO
 */
Promise.prototype.apply = function Promise_apply(thisp, args) {
    return this.dispatch("call", [args, thisp]);
};

/**
 * TODO
 */
Promise.prototype.call = function Promise_call(thisp /*, ...args*/) {
    var args = new Array(Math.max(0, arguments.length - 1));
    for (var index = 1; index < arguments.length; index++) {
        args[index - 1] = arguments[index];
    }
    return this.dispatch("call", [args, thisp]);
};

/**
 * TODO
 */
Promise.prototype.bind = function Promise_bind(thisp /*, ...args*/) {
    var self = this;
    var args = new Array(Math.max(0, arguments.length - 1));
    for (var index = 1; index < arguments.length; index++) {
        args[index - 1] = arguments[index];
    }
    return function Promise_bind_bound(/*...args*/) {
        var boundArgs = args.slice();
        for (var index = 0; index < arguments.length; index++) {
            boundArgs[boundArgs.length] = arguments[index];
        }
        return self.dispatch("call", [boundArgs, thisp]);
    };
};

/**
 * TODO
 */
Promise.prototype.keys = function Promise_keys() {
    return this.dispatch("keys", []);
};

/**
 * TODO
 */
Promise.prototype.iterate = function Promise_iterate() {
    return this.dispatch("iterate", []);
};

/**
 * TODO
 */
Promise.prototype.spread = function Promise_spread(fulfilled, rejected, ms) {
    return this.all().then(function Promise_spread_fulfilled(array) {
        return fulfilled.apply(void 0, array);
    }, rejected, ms);
};

/**
 * Causes a promise to be rejected if it does not get fulfilled before
 * some milliseconds time out.
 * @param {Number} milliseconds timeout
 * @param {String} custom error message (optional)
 * @returns a promise for the resolution of the given promise if it is
 * fulfilled before the timeout, otherwise rejected.
 */
Promise.prototype.timeout = function Promsie_timeout(ms, message) {
    var deferred = defer();
    var timeoutId = setTimeout(function Promise_timeout_task() {
        deferred.reject(new Error(message || "Timed out after " + ms + " ms"));
    }, ms);

    this.then(function Promise_timeout_fulfilled(value) {
        clearTimeout(timeoutId);
        deferred.resolve(value);
    }, function Promise_timeout_rejected(error) {
        clearTimeout(timeoutId);
        deferred.reject(error);
    });

    return deferred.promise;
};

/**
 * Returns a promise for the given value (or promised value), some
 * milliseconds after it resolved. Passes rejections immediately.
 * @param {Any*} promise
 * @param {Number} milliseconds
 * @returns a promise for the resolution of the given promise after milliseconds
 * time has elapsed since the resolution of the given promise.
 * If the given promise rejects, that is passed immediately.
 */
Promise.prototype.delay = function Promise_delay(ms) {
    return this.then(function Promise_delay_fulfilled(value) {
        var deferred = defer();
        deferred.setEstimate(Date.now() + ms);
        setTimeout(function Promise_delay_task() {
            deferred.resolve(value);
        }, ms);
        return deferred.promise;
    }, null, ms);
};

/**
 * TODO
 */
Promise.prototype.pull = function Promise_pull() {
    return this.dispatch("pull", []);
};


// Thus begins the portion dedicated to the deferred

var promises = new WeakMap();

function Deferred(promise) {
    this.promise = promise;
    // A deferred has an intrinsic promise, denoted by its hidden handler
    // property.  The promise property of the deferred may be assigned to a
    // different promise (as it is in a Queue), but the intrinsic promise does
    // not change.
    promises.set(this, promise);
    var self = this;
    var resolve = this.resolve;
    this.resolve = function (value) {
        resolve.call(self, value);
    };
    var reject = this.reject;
    this.reject = function (error) {
        reject.call(self, error);
    };
}

/**
 * TODO
 */
Deferred.prototype.resolve = function Deferred_resolve(value) {
    var handler = Q_inspect(promises.get(this));
    if (!handler.messages) {
        return;
    }
    handler.become(Q(value));
};

/**
 * TODO
 */
Deferred.prototype.reject = function Deferred_reject(reason) {
    var handler = Q_inspect(promises.get(this));
    if (!handler.messages) {
        return;
    }
    handler.become(Q_reject(reason));
};

/**
 * TODO
 */
Deferred.prototype.setEstimate = function Deferred_setEstimate(estimate) {
    estimate = +estimate;
    if (estimate !== estimate) {
        estimate = Infinity;
    }
    if (estimate < 1e12 && estimate !== -Infinity) {
        throw new Error("Estimate values should be a number of miliseconds in the future");
    }
    var handler = Q_inspect(promises.get(this));
    // TODO There is a bit of capability leakage going on here. The Deferred
    // should only be able to set the estimate for its original
    // Pending, not for any handler that promise subsequently became.
    if (handler.setEstimate) {
        handler.setEstimate(estimate);
    }
};

// Thus ends the public interface

// Thus begins the portion dedicated to handlers

function Fulfilled(value) {
    this.value = value;
    this.estimate = Date.now();
}

Fulfilled.prototype.state = "fulfilled";

Fulfilled.prototype.inspect = function Fulfilled_inspect() {
    return {state: "fulfilled", value: this.value};
};

Fulfilled.prototype.dispatch = function Fulfilled_dispatch(
    resolve, op, operands
) {
    var result;
    if (
        op === "then" ||
        op === "get" ||
        op === "call" ||
        op === "invoke" ||
        op === "keys" ||
        op === "iterate" ||
        op === "pull"
    ) {
        try {
            result = this[op].apply(this, operands);
        } catch (exception) {
            result = Q_reject(exception);
        }
    } else if (op === "estimate") {
        operands[0].call(void 0, this.estimate);
    } else {
        var error = new Error(
            "Fulfilled promises do not support the " + op + " operator"
        );
        result = Q_reject(error);
    }
    if (resolve) {
        resolve(result);
    }
};

Fulfilled.prototype.then = function Fulfilled_then() {
    return this.value;
};

Fulfilled.prototype.get = function Fulfilled_get(name) {
    return this.value[name];
};

Fulfilled.prototype.invoke = function Fulfilled_invoke(
    name, args
) {
    return this.value[name].apply(this.value, args);
};

Fulfilled.prototype.call = function Fulfilled_call(args, thisp) {
    return this.value.apply(thisp, args);
};

Fulfilled.prototype.keys = function Fulfilled_keys() {
    return Object.keys(this.value);
};

Fulfilled.prototype.iterate = function Fulfilled_iterate() {
    return new Iterator(this.value);
};

Fulfilled.prototype.pull = function Fulfilled_pull() {
    var result;
    if (Object(this.value) === this.value) {
        result = Array.isArray(this.value) ? [] : {};
        for (var name in this.value) {
            result[name] = this.value[name];
        }
    } else {
        result = this.value;
    }
    return Q.push(result);
};


function Rejected(reason) {
    this.reason = reason;
    this.estimate = Infinity;
}

Rejected.prototype.state = "rejected";

Rejected.prototype.inspect = function Rejected_inspect() {
    return {state: "rejected", reason: this.reason};
};

Rejected.prototype.dispatch = function Rejected_dispatch(
    resolve, op, operands
) {
    var result;
    if (op === "then") {
        result = this.then(resolve, operands[0]);
    } else {
        result = this;
    }
    if (resolve) {
        resolve(result);
    }
};

Rejected.prototype.then = function Rejected_then(
    resolve, rejected
) {
    return rejected ? rejected(this.reason) : this;
};


function Pending() {
    // if "messages" is an "Array", that indicates that the promise has not yet
    // been resolved.  If it is "undefined", it has been resolved.  Each
    // element of the messages array is itself an array of complete arguments to
    // forward to the resolved promise.  We coerce the resolution value to a
    // promise using the `resolve` function because it handles both fully
    // non-thenable values and other thenables gracefully.
    this.messages = [];
    this.observers = [];
    this.estimate = Infinity;
}

Pending.prototype.state = "pending";

Pending.prototype.inspect = function Pending_inspect() {
    return {state: "pending"};
};

Pending.prototype.dispatch = function Pending_dispatch(resolve, op, operands) {
    this.messages.push([resolve, op, operands]);
    if (op === "estimate") {
        this.observers.push(operands[0]);
        var self = this;
        asap(function Pending_dispatch_task() {
            operands[0].call(void 0, self.estimate);
        });
    }
};

Pending.prototype.become = function Pending_become(promise) {
    this.became = theViciousCycle;
    var handler = Q_inspect(promise);
    this.became = handler;

    handlers.set(promise, handler);
    this.promise = void 0;

    this.messages.forEach(function Pending_become_eachMessage(message) {
        // makeQ does not have this asap call, so it must be queueing events
        // downstream. TODO look at makeQ to ascertain
        asap(function Pending_become_eachMessage_task() {
            var handler = Q_inspect(promise);
            handler.dispatch.apply(handler, message);
        });
    });

    this.messages = void 0;
    this.observers = void 0;
};

Pending.prototype.setEstimate = function Pending_setEstimate(estimate) {
    if (this.observers) {
        var self = this;
        self.estimate = estimate;
        this.observers.forEach(function Pending_eachObserver(observer) {
            asap(function Pending_setEstimate_eachObserver_task() {
                observer.call(void 0, estimate);
            });
        });
    }
};

function Thenable(thenable) {
    this.thenable = thenable;
    this.became = null;
    this.estimate = Infinity;
}

Thenable.prototype.state = "thenable";

Thenable.prototype.inspect = function Thenable_inspect() {
    return {state: "pending"};
};

Thenable.prototype.cast = function Thenable_cast() {
    if (!this.became) {
        var deferred = defer();
        var thenable = this.thenable;
        asap(function Thenable_cast_task() {
            try {
                thenable.then(deferred.resolve, deferred.reject);
            } catch (exception) {
                deferred.reject(exception);
            }
        });
        this.became = Q_inspect(deferred.promise);
    }
    return this.became;
};

Thenable.prototype.dispatch = function Thenable_dispatch(resolve, op, args) {
    this.cast().dispatch(resolve, op, args);
};


// Thus begins the Q Node.js bridge

/**
 * Calls a method of a Node-style object that accepts a Node-style
 * callback, forwarding the given variadic arguments, plus a provided
 * callback argument.
 * @param object an object that has the named method
 * @param {String} name name of the method of object
 * @param ...args arguments to pass to the method; the callback will
 * be provided by Q and appended to these arguments.
 * @returns a promise for the value or error
 */
Q.ninvoke = function Q_ninvoke(object, name /*...args*/) {
    var args = new Array(Math.max(0, arguments.length - 1));
    for (var index = 2; index < arguments.length; index++) {
        args[index - 2] = arguments[index];
    }
    var deferred = Q.defer();
    args[index - 2] = makeNodebackResolver(deferred.resolve);
    Q(object).dispatch("invoke", [name, args]).catch(deferred.reject);
    return deferred.promise;
};

/**
 * Wraps a Node.js continuation passing function and returns an equivalent
 * version that returns a promise.
 * @example
 * Q.denodeify(FS.readFile)(__filename, "utf-8")
 * .then(console.log)
 * .done()
 */
Q.denodeify = function Q_denodeify(callback, pattern) {
    return function denodeified() {
        var args = new Array(arguments.length + 1);
        var index = 0;
        for (; index < arguments.length; index++) {
            args[index] = arguments[index];
        }
        var deferred = Q.defer();
        args[index] = makeNodebackResolver(deferred.resolve, pattern);
        Q(callback).apply(this, args).catch(deferred.reject);
        return deferred.promise;
    };
};

/**
 * Creates a Node.js-style callback that will resolve or reject the deferred
 * promise.
 * TODO
 * @returns a nodeback
 * @private
 */
function makeNodebackResolver(resolve, names) {
    if (names === true) {
        return function variadicNodebackToResolver(error) {
            if (error) {
                resolve(Q_reject(error));
            } else {
                var value = new Array(Math.max(0, arguments.length - 1));
                for (var index = 1; index < arguments.length; index++) {
                    value[index - 1] = arguments[index];
                }
                resolve(value);
            }
        };
    } else if (names) {
        return function namedArgumentNodebackToResolver(error) {
            if (error) {
                resolve(Q_reject(error));
            } else {
                var value = {};
                for (var index in names) {
                    value[names[index]] = arguments[index + 1];
                }
                resolve(value);
            }
        };
    } else {
        return function nodebackToResolver(error, value) {
            if (error) {
                resolve(Q_reject(error));
            } else {
                resolve(value);
            }
        };
    }
}

/**
 * TODO
 */
Promise.prototype.nodeify = function Promise_nodeify(nodeback) {
    if (nodeback) {
        this.done(function (value) {
            nodeback(null, value);
        }, nodeback);
    } else {
        return this;
    }
};


// DEPRECATED

Q.nextTick = deprecate(asap, "nextTick", "asap package");

Q.resolve = deprecate(Q, "resolve", "Q");

Q.fulfill = deprecate(Q, "fulfill", "Q");

Q.isPromiseAlike = deprecate(isThenable, "isPromiseAlike", "(not supported)");

Q.fail = deprecate(function (value, rejected) {
    return Q(value).catch(rejected);
}, "Q.fail", "Q(value).catch");

Q.fin = deprecate(function (value, regardless) {
    return Q(value).finally(regardless);
}, "Q.fin", "Q(value).finally");

Q.progress = deprecate(function (value) {
    return value;
}, "Q.progress", "no longer supported");

Q.thenResolve = deprecate(function (promise, value) {
    return Q(promise).thenResolve(value);
}, "thenResolve", "Q(value).thenResolve");

Q.thenReject = deprecate(function (promise, reason) {
    return Q(promise).thenResolve(reason);
}, "thenResolve", "Q(value).thenResolve");

Q.isPending = deprecate(function (value) {
    return Q(value).isPending();
}, "isPending", "Q(value).isPending");

Q.isFulfilled = deprecate(function (value) {
    return Q(value).isFulfilled();
}, "isFulfilled", "Q(value).isFulfilled");

Q.isRejected = deprecate(function (value) {
    return Q(value).isRejected();
}, "isRejected", "Q(value).isRejected");

Q.master = deprecate(function (value) {
    return value;
}, "master", "no longer necessary");

Q.makePromise = function () {
    throw new Error("makePromise is no longer supported");
};

Q.dispatch = deprecate(function (value, op, operands) {
    return Q(value).dispatch(op, operands);
}, "dispatch", "Q(value).dispatch");

Q.get = deprecate(function (object, name) {
    return Q(object).get(name);
}, "get", "Q(value).get");

Q.keys = deprecate(function (object) {
    return Q(object).keys();
}, "keys", "Q(value).keys");

Q.post = deprecate(function (object, name, args) {
    return Q(object).post(name, args);
}, "post", "Q(value).invoke (spread arguments)");

Q.mapply = deprecate(function (object, name, args) {
    return Q(object).post(name, args);
}, "post", "Q(value).invoke (spread arguments)");

Q.send = deprecate(function (object, name) {
    return Q(object).post(name, Array.prototype.slice.call(arguments, 2));
}, "send", "Q(value).invoke");

Q.set = function () {
    throw new Error("Q.set no longer supported");
};

Q.delete = function () {
    throw new Error("Q.delete no longer supported");
};

Q.nearer = deprecate(function (value) {
    if (Q_isPromise(value) && value.isFulfilled()) {
        return value.inspect().value;
    } else {
        return value;
    }
}, "nearer", "inspect().value (+nuances)");

Q.fapply = deprecate(function (callback, args) {
    return Q(callback).dispatch("call", [args]);
}, "fapply", "Q(callback).apply(thisp, args)");

Q.fcall = deprecate(function (callback /*, ...args*/) {
    return Q(callback).dispatch("call", [Array.prototype.slice.call(arguments, 1)]);
}, "fcall", "Q(callback).call(thisp, ...args)");

Q.fbind = deprecate(function (object /*...args*/) {
    var promise = Q(object);
    var args = Array.prototype.slice.call(arguments, 1);
    return function fbound() {
        return promise.dispatch("call", [
            args.concat(Array.prototype.slice.call(arguments)),
            this
        ]);
    };
}, "fbind", "bind with thisp");

Q.promise = deprecate(Promise, "promise", "Promise");

Promise.prototype.fapply = deprecate(function (args) {
    return this.dispatch("call", [args]);
}, "fapply", "apply with thisp");

Promise.prototype.fcall = deprecate(function (/*...args*/) {
    return this.dispatch("call", [Array.prototype.slice.call(arguments)]);
}, "fcall", "try or call with thisp");

Promise.prototype.fail = deprecate(function (rejected) {
    return this.catch(rejected);
}, "fail", "catch");

Promise.prototype.fin = deprecate(function (regardless) {
    return this.finally(regardless);
}, "fin", "finally");

Promise.prototype.set = function () {
    throw new Error("Promise set no longer supported");
};

Promise.prototype.delete = function () {
    throw new Error("Promise delete no longer supported");
};

Deferred.prototype.notify = deprecate(function () {
}, "notify", "no longer supported");

Promise.prototype.progress = deprecate(function () {
    return this;
}, "progress", "no longer supported");

// alternative proposed by Redsandro, dropped in favor of post to streamline
// the interface
Promise.prototype.mapply = deprecate(function (name, args) {
    return this.dispatch("invoke", [name, args]);
}, "mapply", "invoke");

Promise.prototype.fbind = deprecate(function () {
    return Q.fbind.apply(Q, [void 0].concat(Array.prototype.slice.call(arguments)));
}, "fbind", "bind(thisp, ...args)");

// alternative proposed by Mark Miller, dropped in favor of invoke
Promise.prototype.send = deprecate(function () {
    return this.dispatch("invoke", [name, Array.prototype.slice.call(arguments, 1)]);
}, "send", "invoke");

// alternative proposed by Redsandro, dropped in favor of invoke
Promise.prototype.mcall = deprecate(function () {
    return this.dispatch("invoke", [name, Array.prototype.slice.call(arguments, 1)]);
}, "mcall", "invoke");

Promise.prototype.passByCopy = deprecate(function (value) {
    return value;
}, "passByCopy", "Q.passByCopy");

// Deprecated Node.js bridge promise methods

Q.nfapply = deprecate(function (callback, args) {
    var deferred = Q.defer();
    var nodeArgs = Array.prototype.slice.call(args);
    nodeArgs.push(makeNodebackResolver(deferred.resolve));
    Q(callback).apply(this, nodeArgs).catch(deferred.reject);
    return deferred.promise;
}, "nfapply");

Promise.prototype.nfapply = deprecate(function (args) {
    return Q.nfapply(this, args);
}, "nfapply");

Q.nfcall = deprecate(function (callback /*...args*/) {
    var args = Array.prototype.slice.call(arguments, 1);
    return Q.nfapply(callback, args);
}, "nfcall");

Promise.prototype.nfcall = deprecate(function () {
    var args = new Array(arguments.length);
    for (var index = 0; index < arguments.length; index++) {
        args[index] = arguments[index];
    }
    return Q.nfapply(this, args);
}, "nfcall");

Q.nfbind = deprecate(function (callback /*...args*/) {
    var baseArgs = Array.prototype.slice.call(arguments, 1);
    return function () {
        var nodeArgs = baseArgs.concat(Array.prototype.slice.call(arguments));
        var deferred = Q.defer();
        nodeArgs.push(makeNodebackResolver(deferred.resolve));
        Q(callback).apply(this, nodeArgs).catch(deferred.reject);
        return deferred.promise;
    };
}, "nfbind", "denodeify (with caveats)");

Promise.prototype.nfbind = deprecate(function () {
    var args = new Array(arguments.length);
    for (var index = 0; index < arguments.length; index++) {
        args[index] = arguments[index];
    }
    return Q.nfbind(this, args);
}, "nfbind", "denodeify (with caveats)");

Q.nbind = deprecate(function (callback, thisp /*...args*/) {
    var baseArgs = Array.prototype.slice.call(arguments, 2);
    return function () {
        var nodeArgs = baseArgs.concat(Array.prototype.slice.call(arguments));
        var deferred = Q.defer();
        nodeArgs.push(makeNodebackResolver(deferred.resolve));
        function bound() {
            return callback.apply(thisp, arguments);
        }
        Q(bound).apply(this, nodeArgs).catch(deferred.reject);
        return deferred.promise;
    };
}, "nbind", "denodeify (with caveats)");

Q.npost = deprecate(function (object, name, nodeArgs) {
    var deferred = Q.defer();
    nodeArgs.push(makeNodebackResolver(deferred.resolve));
    Q(object).dispatch("invoke", [name, nodeArgs]).catch(deferred.reject);
    return deferred.promise;
}, "npost", "ninvoke (with spread arguments)");

Promise.prototype.npost = deprecate(function (name, args) {
    return Q.npost(this, name, args);
}, "npost", "Q.ninvoke (with caveats)");

Q.makeNodeResolver = deprecate(makeNodebackResolver, "makeNodeResolver");

Promise.prototype.ninvoke = deprecate(function (name) {
    var args = new Array(arguments.length - 1);
    for (var index = 1; index < arguments.length; index++) {
        args[index - 1] = arguments[index];
    }
    return Q.npost(this, name, args);
}, "ninvoke", "Q.ninvoke");

Q.nmapply = deprecate(Q.nmapply, "nmapply", "q/node nmapply");
Promise.prototype.nmapply = deprecate(Promise.prototype.npost, "nmapply", "Q.nmapply");

Q.nsend = deprecate(Q.ninvoke, "nsend", "q/node ninvoke");
Q.nmcall = deprecate(Q.ninvoke, "nmcall", "q/node ninvoke");
Promise.prototype.nsend = deprecate(Promise.prototype.ninvoke, "nsend", "q/node ninvoke");
Promise.prototype.nmcall = deprecate(Promise.prototype.ninvoke, "nmcall", "q/node ninvoke");

// All code before this point will be filtered from stack traces.
var qEndingLine = captureLine();

}],["weak-map","weak-map",{},function (require, exports, module){

// weak-map weak-map
// -----------------

// Copyright (C) 2011 Google Inc.
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
// http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

/**
 * @fileoverview Install a leaky WeakMap emulation on platforms that
 * don't provide a built-in one.
 *
 * <p>Assumes that an ES5 platform where, if {@code WeakMap} is
 * already present, then it conforms to the anticipated ES6
 * specification. To run this file on an ES5 or almost ES5
 * implementation where the {@code WeakMap} specification does not
 * quite conform, run <code>repairES5.js</code> first.
 *
 * <p>Even though WeakMapModule is not global, the linter thinks it
 * is, which is why it is in the overrides list below.
 *
 * <p>NOTE: Before using this WeakMap emulation in a non-SES
 * environment, see the note below about hiddenRecord.
 *
 * @author Mark S. Miller
 * @requires crypto, ArrayBuffer, Uint8Array, navigator, console
 * @overrides WeakMap, ses, Proxy
 * @overrides WeakMapModule
 */

/**
 * This {@code WeakMap} emulation is observably equivalent to the
 * ES-Harmony WeakMap, but with leakier garbage collection properties.
 *
 * <p>As with true WeakMaps, in this emulation, a key does not
 * retain maps indexed by that key and (crucially) a map does not
 * retain the keys it indexes. A map by itself also does not retain
 * the values associated with that map.
 *
 * <p>However, the values associated with a key in some map are
 * retained so long as that key is retained and those associations are
 * not overridden. For example, when used to support membranes, all
 * values exported from a given membrane will live for the lifetime
 * they would have had in the absence of an interposed membrane. Even
 * when the membrane is revoked, all objects that would have been
 * reachable in the absence of revocation will still be reachable, as
 * far as the GC can tell, even though they will no longer be relevant
 * to ongoing computation.
 *
 * <p>The API implemented here is approximately the API as implemented
 * in FF6.0a1 and agreed to by MarkM, Andreas Gal, and Dave Herman,
 * rather than the offially approved proposal page. TODO(erights):
 * upgrade the ecmascript WeakMap proposal page to explain this API
 * change and present to EcmaScript committee for their approval.
 *
 * <p>The first difference between the emulation here and that in
 * FF6.0a1 is the presence of non enumerable {@code get___, has___,
 * set___, and delete___} methods on WeakMap instances to represent
 * what would be the hidden internal properties of a primitive
 * implementation. Whereas the FF6.0a1 WeakMap.prototype methods
 * require their {@code this} to be a genuine WeakMap instance (i.e.,
 * an object of {@code [[Class]]} "WeakMap}), since there is nothing
 * unforgeable about the pseudo-internal method names used here,
 * nothing prevents these emulated prototype methods from being
 * applied to non-WeakMaps with pseudo-internal methods of the same
 * names.
 *
 * <p>Another difference is that our emulated {@code
 * WeakMap.prototype} is not itself a WeakMap. A problem with the
 * current FF6.0a1 API is that WeakMap.prototype is itself a WeakMap
 * providing ambient mutability and an ambient communications
 * channel. Thus, if a WeakMap is already present and has this
 * problem, repairES5.js wraps it in a safe wrappper in order to
 * prevent access to this channel. (See
 * PATCH_MUTABLE_FROZEN_WEAKMAP_PROTO in repairES5.js).
 */

/**
 * If this is a full <a href=
 * "http://code.google.com/p/es-lab/wiki/SecureableES5"
 * >secureable ES5</a> platform and the ES-Harmony {@code WeakMap} is
 * absent, install an approximate emulation.
 *
 * <p>If WeakMap is present but cannot store some objects, use our approximate
 * emulation as a wrapper.
 *
 * <p>If this is almost a secureable ES5 platform, then WeakMap.js
 * should be run after repairES5.js.
 *
 * <p>See {@code WeakMap} for documentation of the garbage collection
 * properties of this WeakMap emulation.
 */
(function WeakMapModule() {
  "use strict";

  if (typeof ses !== 'undefined' && ses.ok && !ses.ok()) {
    // already too broken, so give up
    return;
  }

  /**
   * In some cases (current Firefox), we must make a choice betweeen a
   * WeakMap which is capable of using all varieties of host objects as
   * keys and one which is capable of safely using proxies as keys. See
   * comments below about HostWeakMap and DoubleWeakMap for details.
   *
   * This function (which is a global, not exposed to guests) marks a
   * WeakMap as permitted to do what is necessary to index all host
   * objects, at the cost of making it unsafe for proxies.
   *
   * Do not apply this function to anything which is not a genuine
   * fresh WeakMap.
   */
  function weakMapPermitHostObjects(map) {
    // identity of function used as a secret -- good enough and cheap
    if (map.permitHostObjects___) {
      map.permitHostObjects___(weakMapPermitHostObjects);
    }
  }
  if (typeof ses !== 'undefined') {
    ses.weakMapPermitHostObjects = weakMapPermitHostObjects;
  }

  // IE 11 has no Proxy but has a broken WeakMap such that we need to patch
  // it using DoubleWeakMap; this flag tells DoubleWeakMap so.
  var doubleWeakMapCheckSilentFailure = false;

  // Check if there is already a good-enough WeakMap implementation, and if so
  // exit without replacing it.
  if (typeof WeakMap === 'function') {
    var HostWeakMap = WeakMap;
    // There is a WeakMap -- is it good enough?
    if (typeof navigator !== 'undefined' &&
        /Firefox/.test(navigator.userAgent)) {
      // We're now *assuming not*, because as of this writing (2013-05-06)
      // Firefox's WeakMaps have a miscellany of objects they won't accept, and
      // we don't want to make an exhaustive list, and testing for just one
      // will be a problem if that one is fixed alone (as they did for Event).

      // If there is a platform that we *can* reliably test on, here's how to
      // do it:
      //  var problematic = ... ;
      //  var testHostMap = new HostWeakMap();
      //  try {
      //    testHostMap.set(problematic, 1);  // Firefox 20 will throw here
      //    if (testHostMap.get(problematic) === 1) {
      //      return;
      //    }
      //  } catch (e) {}

    } else {
      // IE 11 bug: WeakMaps silently fail to store frozen objects.
      var testMap = new HostWeakMap();
      var testObject = Object.freeze({});
      testMap.set(testObject, 1);
      if (testMap.get(testObject) !== 1) {
        doubleWeakMapCheckSilentFailure = true;
        // Fall through to installing our WeakMap.
      } else {
        module.exports = WeakMap;
        return;
      }
    }
  }

  var hop = Object.prototype.hasOwnProperty;
  var gopn = Object.getOwnPropertyNames;
  var defProp = Object.defineProperty;
  var isExtensible = Object.isExtensible;

  /**
   * Security depends on HIDDEN_NAME being both <i>unguessable</i> and
   * <i>undiscoverable</i> by untrusted code.
   *
   * <p>Given the known weaknesses of Math.random() on existing
   * browsers, it does not generate unguessability we can be confident
   * of.
   *
   * <p>It is the monkey patching logic in this file that is intended
   * to ensure undiscoverability. The basic idea is that there are
   * three fundamental means of discovering properties of an object:
   * The for/in loop, Object.keys(), and Object.getOwnPropertyNames(),
   * as well as some proposed ES6 extensions that appear on our
   * whitelist. The first two only discover enumerable properties, and
   * we only use HIDDEN_NAME to name a non-enumerable property, so the
   * only remaining threat should be getOwnPropertyNames and some
   * proposed ES6 extensions that appear on our whitelist. We monkey
   * patch them to remove HIDDEN_NAME from the list of properties they
   * returns.
   *
   * <p>TODO(erights): On a platform with built-in Proxies, proxies
   * could be used to trap and thereby discover the HIDDEN_NAME, so we
   * need to monkey patch Proxy.create, Proxy.createFunction, etc, in
   * order to wrap the provided handler with the real handler which
   * filters out all traps using HIDDEN_NAME.
   *
   * <p>TODO(erights): Revisit Mike Stay's suggestion that we use an
   * encapsulated function at a not-necessarily-secret name, which
   * uses the Stiegler shared-state rights amplification pattern to
   * reveal the associated value only to the WeakMap in which this key
   * is associated with that value. Since only the key retains the
   * function, the function can also remember the key without causing
   * leakage of the key, so this doesn't violate our general gc
   * goals. In addition, because the name need not be a guarded
   * secret, we could efficiently handle cross-frame frozen keys.
   */
  var HIDDEN_NAME_PREFIX = 'weakmap:';
  var HIDDEN_NAME = HIDDEN_NAME_PREFIX + 'ident:' + Math.random() + '___';

  if (typeof crypto !== 'undefined' &&
      typeof crypto.getRandomValues === 'function' &&
      typeof ArrayBuffer === 'function' &&
      typeof Uint8Array === 'function') {
    var ab = new ArrayBuffer(25);
    var u8s = new Uint8Array(ab);
    crypto.getRandomValues(u8s);
    HIDDEN_NAME = HIDDEN_NAME_PREFIX + 'rand:' +
      Array.prototype.map.call(u8s, function(u8) {
        return (u8 % 36).toString(36);
      }).join('') + '___';
  }

  function isNotHiddenName(name) {
    return !(
        name.substr(0, HIDDEN_NAME_PREFIX.length) == HIDDEN_NAME_PREFIX &&
        name.substr(name.length - 3) === '___');
  }

  /**
   * Monkey patch getOwnPropertyNames to avoid revealing the
   * HIDDEN_NAME.
   *
   * <p>The ES5.1 spec requires each name to appear only once, but as
   * of this writing, this requirement is controversial for ES6, so we
   * made this code robust against this case. If the resulting extra
   * search turns out to be expensive, we can probably relax this once
   * ES6 is adequately supported on all major browsers, iff no browser
   * versions we support at that time have relaxed this constraint
   * without providing built-in ES6 WeakMaps.
   */
  defProp(Object, 'getOwnPropertyNames', {
    value: function fakeGetOwnPropertyNames(obj) {
      return gopn(obj).filter(isNotHiddenName);
    }
  });

  /**
   * getPropertyNames is not in ES5 but it is proposed for ES6 and
   * does appear in our whitelist, so we need to clean it too.
   */
  if ('getPropertyNames' in Object) {
    var originalGetPropertyNames = Object.getPropertyNames;
    defProp(Object, 'getPropertyNames', {
      value: function fakeGetPropertyNames(obj) {
        return originalGetPropertyNames(obj).filter(isNotHiddenName);
      }
    });
  }

  /**
   * <p>To treat objects as identity-keys with reasonable efficiency
   * on ES5 by itself (i.e., without any object-keyed collections), we
   * need to add a hidden property to such key objects when we
   * can. This raises several issues:
   * <ul>
   * <li>Arranging to add this property to objects before we lose the
   *     chance, and
   * <li>Hiding the existence of this new property from most
   *     JavaScript code.
   * <li>Preventing <i>certification theft</i>, where one object is
   *     created falsely claiming to be the key of an association
   *     actually keyed by another object.
   * <li>Preventing <i>value theft</i>, where untrusted code with
   *     access to a key object but not a weak map nevertheless
   *     obtains access to the value associated with that key in that
   *     weak map.
   * </ul>
   * We do so by
   * <ul>
   * <li>Making the name of the hidden property unguessable, so "[]"
   *     indexing, which we cannot intercept, cannot be used to access
   *     a property without knowing the name.
   * <li>Making the hidden property non-enumerable, so we need not
   *     worry about for-in loops or {@code Object.keys},
   * <li>monkey patching those reflective methods that would
   *     prevent extensions, to add this hidden property first,
   * <li>monkey patching those methods that would reveal this
   *     hidden property.
   * </ul>
   * Unfortunately, because of same-origin iframes, we cannot reliably
   * add this hidden property before an object becomes
   * non-extensible. Instead, if we encounter a non-extensible object
   * without a hidden record that we can detect (whether or not it has
   * a hidden record stored under a name secret to us), then we just
   * use the key object itself to represent its identity in a brute
   * force leaky map stored in the weak map, losing all the advantages
   * of weakness for these.
   */
  function getHiddenRecord(key) {
    if (key !== Object(key)) {
      throw new TypeError('Not an object: ' + key);
    }
    var hiddenRecord = key[HIDDEN_NAME];
    if (hiddenRecord && hiddenRecord.key === key) { return hiddenRecord; }
    if (!isExtensible(key)) {
      // Weak map must brute force, as explained in doc-comment above.
      return void 0;
    }

    // The hiddenRecord and the key point directly at each other, via
    // the "key" and HIDDEN_NAME properties respectively. The key
    // field is for quickly verifying that this hidden record is an
    // own property, not a hidden record from up the prototype chain.
    //
    // NOTE: Because this WeakMap emulation is meant only for systems like
    // SES where Object.prototype is frozen without any numeric
    // properties, it is ok to use an object literal for the hiddenRecord.
    // This has two advantages:
    // * It is much faster in a performance critical place
    // * It avoids relying on Object.create(null), which had been
    //   problematic on Chrome 28.0.1480.0. See
    //   https://code.google.com/p/google-caja/issues/detail?id=1687
    hiddenRecord = { key: key };

    // When using this WeakMap emulation on platforms where
    // Object.prototype might not be frozen and Object.create(null) is
    // reliable, use the following two commented out lines instead.
    // hiddenRecord = Object.create(null);
    // hiddenRecord.key = key;

    // Please contact us if you need this to work on platforms where
    // Object.prototype might not be frozen and
    // Object.create(null) might not be reliable.

    defProp(key, HIDDEN_NAME, {
      value: hiddenRecord,
      writable: false,
      enumerable: false,
      configurable: false
    });
    return hiddenRecord;
  }

  /**
   * Monkey patch operations that would make their argument
   * non-extensible.
   *
   * <p>The monkey patched versions throw a TypeError if their
   * argument is not an object, so it should only be done to functions
   * that should throw a TypeError anyway if their argument is not an
   * object.
   */
  (function(){
    var oldFreeze = Object.freeze;
    defProp(Object, 'freeze', {
      value: function identifyingFreeze(obj) {
        getHiddenRecord(obj);
        return oldFreeze(obj);
      }
    });
    var oldSeal = Object.seal;
    defProp(Object, 'seal', {
      value: function identifyingSeal(obj) {
        getHiddenRecord(obj);
        return oldSeal(obj);
      }
    });
    var oldPreventExtensions = Object.preventExtensions;
    defProp(Object, 'preventExtensions', {
      value: function identifyingPreventExtensions(obj) {
        getHiddenRecord(obj);
        return oldPreventExtensions(obj);
      }
    });
  })();

  function constFunc(func) {
    func.prototype = null;
    return Object.freeze(func);
  }

  var calledAsFunctionWarningDone = false;
  function calledAsFunctionWarning() {
    // Future ES6 WeakMap is currently (2013-09-10) expected to reject WeakMap()
    // but we used to permit it and do it ourselves, so warn only.
    if (!calledAsFunctionWarningDone && typeof console !== 'undefined') {
      calledAsFunctionWarningDone = true;
      console.warn('WeakMap should be invoked as new WeakMap(), not ' +
          'WeakMap(). This will be an error in the future.');
    }
  }

  var nextId = 0;

  var OurWeakMap = function() {
    if (!(this instanceof OurWeakMap)) {  // approximate test for new ...()
      calledAsFunctionWarning();
    }

    // We are currently (12/25/2012) never encountering any prematurely
    // non-extensible keys.
    var keys = []; // brute force for prematurely non-extensible keys.
    var values = []; // brute force for corresponding values.
    var id = nextId++;

    function get___(key, opt_default) {
      var index;
      var hiddenRecord = getHiddenRecord(key);
      if (hiddenRecord) {
        return id in hiddenRecord ? hiddenRecord[id] : opt_default;
      } else {
        index = keys.indexOf(key);
        return index >= 0 ? values[index] : opt_default;
      }
    }

    function has___(key) {
      var hiddenRecord = getHiddenRecord(key);
      if (hiddenRecord) {
        return id in hiddenRecord;
      } else {
        return keys.indexOf(key) >= 0;
      }
    }

    function set___(key, value) {
      var index;
      var hiddenRecord = getHiddenRecord(key);
      if (hiddenRecord) {
        hiddenRecord[id] = value;
      } else {
        index = keys.indexOf(key);
        if (index >= 0) {
          values[index] = value;
        } else {
          // Since some browsers preemptively terminate slow turns but
          // then continue computing with presumably corrupted heap
          // state, we here defensively get keys.length first and then
          // use it to update both the values and keys arrays, keeping
          // them in sync.
          index = keys.length;
          values[index] = value;
          // If we crash here, values will be one longer than keys.
          keys[index] = key;
        }
      }
      return this;
    }

    function delete___(key) {
      var hiddenRecord = getHiddenRecord(key);
      var index, lastIndex;
      if (hiddenRecord) {
        return id in hiddenRecord && delete hiddenRecord[id];
      } else {
        index = keys.indexOf(key);
        if (index < 0) {
          return false;
        }
        // Since some browsers preemptively terminate slow turns but
        // then continue computing with potentially corrupted heap
        // state, we here defensively get keys.length first and then use
        // it to update both the keys and the values array, keeping
        // them in sync. We update the two with an order of assignments,
        // such that any prefix of these assignments will preserve the
        // key/value correspondence, either before or after the delete.
        // Note that this needs to work correctly when index === lastIndex.
        lastIndex = keys.length - 1;
        keys[index] = void 0;
        // If we crash here, there's a void 0 in the keys array, but
        // no operation will cause a "keys.indexOf(void 0)", since
        // getHiddenRecord(void 0) will always throw an error first.
        values[index] = values[lastIndex];
        // If we crash here, values[index] cannot be found here,
        // because keys[index] is void 0.
        keys[index] = keys[lastIndex];
        // If index === lastIndex and we crash here, then keys[index]
        // is still void 0, since the aliasing killed the previous key.
        keys.length = lastIndex;
        // If we crash here, keys will be one shorter than values.
        values.length = lastIndex;
        return true;
      }
    }

    return Object.create(OurWeakMap.prototype, {
      get___:    { value: constFunc(get___) },
      has___:    { value: constFunc(has___) },
      set___:    { value: constFunc(set___) },
      delete___: { value: constFunc(delete___) }
    });
  };

  OurWeakMap.prototype = Object.create(Object.prototype, {
    get: {
      /**
       * Return the value most recently associated with key, or
       * opt_default if none.
       */
      value: function get(key, opt_default) {
        return this.get___(key, opt_default);
      },
      writable: true,
      configurable: true
    },

    has: {
      /**
       * Is there a value associated with key in this WeakMap?
       */
      value: function has(key) {
        return this.has___(key);
      },
      writable: true,
      configurable: true
    },

    set: {
      /**
       * Associate value with key in this WeakMap, overwriting any
       * previous association if present.
       */
      value: function set(key, value) {
        return this.set___(key, value);
      },
      writable: true,
      configurable: true
    },

    'delete': {
      /**
       * Remove any association for key in this WeakMap, returning
       * whether there was one.
       *
       * <p>Note that the boolean return here does not work like the
       * {@code delete} operator. The {@code delete} operator returns
       * whether the deletion succeeds at bringing about a state in
       * which the deleted property is absent. The {@code delete}
       * operator therefore returns true if the property was already
       * absent, whereas this {@code delete} method returns false if
       * the association was already absent.
       */
      value: function remove(key) {
        return this.delete___(key);
      },
      writable: true,
      configurable: true
    }
  });

  if (typeof HostWeakMap === 'function') {
    (function() {
      // If we got here, then the platform has a WeakMap but we are concerned
      // that it may refuse to store some key types. Therefore, make a map
      // implementation which makes use of both as possible.

      // In this mode we are always using double maps, so we are not proxy-safe.
      // This combination does not occur in any known browser, but we had best
      // be safe.
      if (doubleWeakMapCheckSilentFailure && typeof Proxy !== 'undefined') {
        Proxy = undefined;
      }

      function DoubleWeakMap() {
        if (!(this instanceof OurWeakMap)) {  // approximate test for new ...()
          calledAsFunctionWarning();
        }

        // Preferable, truly weak map.
        var hmap = new HostWeakMap();

        // Our hidden-property-based pseudo-weak-map. Lazily initialized in the
        // 'set' implementation; thus we can avoid performing extra lookups if
        // we know all entries actually stored are entered in 'hmap'.
        var omap = undefined;

        // Hidden-property maps are not compatible with proxies because proxies
        // can observe the hidden name and either accidentally expose it or fail
        // to allow the hidden property to be set. Therefore, we do not allow
        // arbitrary WeakMaps to switch to using hidden properties, but only
        // those which need the ability, and unprivileged code is not allowed
        // to set the flag.
        //
        // (Except in doubleWeakMapCheckSilentFailure mode in which case we
        // disable proxies.)
        var enableSwitching = false;

        function dget(key, opt_default) {
          if (omap) {
            return hmap.has(key) ? hmap.get(key)
                : omap.get___(key, opt_default);
          } else {
            return hmap.get(key, opt_default);
          }
        }

        function dhas(key) {
          return hmap.has(key) || (omap ? omap.has___(key) : false);
        }

        var dset;
        if (doubleWeakMapCheckSilentFailure) {
          dset = function(key, value) {
            hmap.set(key, value);
            if (!hmap.has(key)) {
              if (!omap) { omap = new OurWeakMap(); }
              omap.set(key, value);
            }
            return this;
          };
        } else {
          dset = function(key, value) {
            if (enableSwitching) {
              try {
                hmap.set(key, value);
              } catch (e) {
                if (!omap) { omap = new OurWeakMap(); }
                omap.set___(key, value);
              }
            } else {
              hmap.set(key, value);
            }
            return this;
          };
        }

        function ddelete(key) {
          var result = !!hmap['delete'](key);
          if (omap) { return omap.delete___(key) || result; }
          return result;
        }

        return Object.create(OurWeakMap.prototype, {
          get___:    { value: constFunc(dget) },
          has___:    { value: constFunc(dhas) },
          set___:    { value: constFunc(dset) },
          delete___: { value: constFunc(ddelete) },
          permitHostObjects___: { value: constFunc(function(token) {
            if (token === weakMapPermitHostObjects) {
              enableSwitching = true;
            } else {
              throw new Error('bogus call to permitHostObjects___');
            }
          })}
        });
      }
      DoubleWeakMap.prototype = OurWeakMap.prototype;
      module.exports = DoubleWeakMap;

      // define .constructor to hide OurWeakMap ctor
      Object.defineProperty(WeakMap.prototype, 'constructor', {
        value: WeakMap,
        enumerable: false,  // as default .constructor is
        configurable: true,
        writable: true
      });
    })();
  } else {
    // There is no host WeakMap, so we must use the emulation.

    // Emulated WeakMaps are incompatible with native proxies (because proxies
    // can observe the hidden name), so we must disable Proxy usage (in
    // ArrayLike and Domado, currently).
    if (typeof Proxy !== 'undefined') {
      Proxy = undefined;
    }

    module.exports = OurWeakMap;
  }
})();
}]]})(this))().done()
