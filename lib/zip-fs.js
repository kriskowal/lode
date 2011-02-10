
var MOCK = require("q-fs/mock");
var ZIP = require("zip");

var Fs = exports.Fs = function (data) {
    var reader = new ZIP.Reader(data);
    return MOCK.Fs(reader.toObject());
};

