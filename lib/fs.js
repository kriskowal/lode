
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
 * @param url: String
 * @param fs:
 *  {
 *      canonical(path): String*,
 *      stat(path): {
 *          isFile(): Boolean,
 *          isDirectory(): Boolean
 *      }*,
 *      read(path, "rb", charset):Buffer*
 *  }
 * @param http:
 *  {
 *      read(url): Buffer*
 *  }
 * @param memo :Object
 */

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
function get(url, fs, http, memo, baseUrl, workingPath) {
    var parsed = URL.parse(url);
    memo = memo || {};
    baseUrl = baseUrl || '';
    if (!memo[baseUrl + url])
        // returns an fs of the non-fragment portion of the url
        memo[baseUrl + url] = Q.when(canonical(parsed, fs, http, workingPath), function (url) {
            return fetch(url, fs, http, baseUrl, workingPath);
        }).then(function (got) {
            // recur into the fragment portion, if exists
            var fragment = (parsed.hash || '').replace(/[#\/]*/, '');
            if (fragment)
                got = get(fragment, got.fs, http, memo, got.href, got.path);
            return got;
        });
    return memo[baseUrl + url];
}

function fetch(url, fs, http, baseUrl, workingPath) {
    var parsed = URL.parse(url);
    if (parsed.protocol === 'file:') {
        var path = parsed.pathname;
        return Q.when(fs.stat(path), function (stat) {
            var relativePath = path;
            if (workingPath !== undefined)
                relativePath = fs.relativeFromDirectory(workingPath, relativePath);
            relativePath = relativePath.replace(/\/$/, '');
            if (stat.isFile()) {
                var extension = fs.extension(path);
                if (extension === ".zip") {
                    // zip archive
                    return Q.when(fs.read(path, "rb"), function (data) {
                        var fs = Zip(data);
                        return Q.when(fs, function (fs) {
                            return {
                                "fs": fs,
                                "path": "",
                                "href": URL.resolve(baseUrl, relativePath) + "#"
                            };
                        });
                    });
                }
                // TODO tar tar.gz tgz
            }
            return {
                "fs": fs,
                "path": path,
                "href": URL.resolve(baseUrl, relativePath) + "/"
            };
        });
    } else if (parsed.protocol === 'http:') {
        return Q.when(http.read(url), function (data) {
            var fs = Zip(data);
            return Q.when(fs, function (fs) {
                return {
                    "fs": fs,
                    "path": "",
                    "href": 'http://' + parsed.host + parsed.pathname + "#"
                };
            });
        });
    } else {
        throw new Error("Cannot fetch over protocol " + parsed.protocol + " (" + url + ")");
    }
}

// accepts paths and file names and returns the canonical
// url if it is a local file
exports.canonical = canonical;
function canonical(url, fs, http, workingPath) {
    if (typeof url === "string")
        url = URL.parse(url);
    if (
        url.protocol === 'file:' ||
        url.protocol === undefined
    ) {
        var path = url.pathname || '';
        if (workingPath)
            path = fs.join(workingPath, path);
        if (!fs)
            return Q.reject("Cannot access the file system via " + url.href);
        return Q.when(fs.canonical(path), function (path) {
            return URL.resolve('file:/', path);
        });
    } else {
        if (!http)
            return Q.reject("Cannot access the web via " + url.href);
        return Q.ref(url.href);
    }
}

function Zip(data) {
    return Mock(new ZIP.Reader(data).toObject()).reroot();
}

