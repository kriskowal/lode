var a = require("./a")
exports.b = 10;
console.log(module);
console.log(require("foo"));
console.log(require("foo/bar"));
console.log(require("bar"));
console.log(require("baz"));
console.log('test', a, require.main);