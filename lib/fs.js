
// todo, unpack a tar,tgz,tar.gz into a path and load
// as an fs package

// The package file system is a web addressed file-system.
// Paths are URL's.  Some are on the file system.  Some are
// inside zip archives.


var Q = require("q");
var URL = require("url"); // node
var ZIP = require("zip");
var HTTP = require("q-http");
var Mock = require("q-fs/mock").Fs;
var Root = require("q-fs/root").Fs;

/*
    a URL
        to a location on the local file system, if permitted
            if the location refers to a file
                if the file is a zip archive
                    returns an fs of the contents of the archive
                else fail
            if the location refers to a directory
                returns an fs of the chroot
        to a location on the web
            if the location refers to a file
                if the file is a zip archive
                    returns an fs of the contents of the archive
                else fail
            else fail
    -> whatever is returned gets wrapped in a root if the url
    has a hash fragment
*/
exports.get = get;
function get(url, fs, memo) {
    var parsed = URL.parse(url);
    memo = memo || {};
    // returns an fs of the non-fragment portion of the url
    return Q.when(canonical(url, parsed, fs), function (url) {
        if (!memo[url])
            memo[url] = fetch(url, fs);
        return memo[url];
    }).then(function (fs) {
        var fragment = parsed.hash;
        if (fragment)
            fs = Root(fs, fragment.slice(1));
        return fs;
    });
}

function fetch(url, fs) {
    var parsed = URL.parse(url);
    if (parsed.protocol === 'file:') {
        if (!fs)
            throw new Error("Cannot read file URL's without a file-system object");
        return Q.when(fs.stat(parsed.pathname), function (stat) {
            if (stat.isFile()) {
                // zip archive
                return Q.when(fs.read(parsed.pathname, "rb"), function (data) {
                    return Zip(data);
                });
            } else if (stat.isDirectory()) {
                return Root(fs, parsed.pathname);
            } else {
                throw new Error("Cannot construct a mock file system from " + url);
            }
        });
    } else if (parsed.protocol === 'http:') {
        return Q.when(HTTP.read(url), function (data) {
            return Zip(data);
        });
    } else {
        throw new Error("Cannot fetch over protocol " + parsed.protocol + " (" + url + ")");
    }
}

// accepts paths and file names and returns the canonical
// url if it is a local file
function canonical(url, parsed, fs) {
    parsed = parsed || URL.parse(url);
    if (
        parsed.protocol === 'file:' ||
        parsed.protocol === undefined
    ) {
        return Q.when(fs.canonical(parsed.pathname), function (path) {
            return URL.resolve('file:/', path);
        });
    } else {
        return Q.ref(url);
    }
}

function Zip(data) {
    return Mock(new ZIP.Reader(data).toObject()).reroot();
}

