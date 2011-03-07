define(function (require, exports, module) {
    var a = require("./a")
    exports.b = 10;
    console.log(module);
    console.log('b:', require("b"));
    console.log('foo:', require("foo"));
    console.log('bar:', require("foo/bar"));
    console.log('bar:', require("bar"));
    console.log('baz:', require("baz"));
    console.log('qux:', require("qux"));
    console.log('test', a, require.main);

    /*
    var pkg = require("package");
    console.log(pkg.resource("data/hello.txt").url());
    */

});
