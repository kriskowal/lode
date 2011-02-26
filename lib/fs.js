
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
function get(url, options) {
    var parsed = URL.parse(url);
    var fragment = (parsed.hash || '').replace(/[#\/]*/, '');
    var memo = options.memo = options.memo || {};
    var href = options.href = options.href || '';
    var path = options.path = options.path || '';
    delete parsed.hash;
    var key = href + URL.format(parsed);
    if (!memo[key])
        // returns an fs of the non-fragment portion of the url
        memo[key] = Q.when(canonical(parsed, options), function (url) {
            return fetch(url, options);
        }).then(function (got) {
            // recur into the fragment portion, if exists
            if (fragment)
                got = get(fragment, got);
            return got;
        });
    return memo[key];
}

function fetch(url, options) {
    var parsed = URL.parse(url);
    delete parsed.hash;
    var fs = options.fs;
    var http = options.http;
    var baseUrl = options.href; // includes the path, if it is defined, in the final fragment
    var basePath = options.path;
    baseUrl = baseUrl.slice(0, baseUrl.length - basePath.length);
    if (parsed.protocol === 'file:') {
        var path = parsed.pathname;
        return Q.when(fs.stat(path), function (stat) {
            if (stat.isFile()) {
                var extension = fs.extension(path);
                if (extension === ".zip") {
                    // zip archive
                    return Q.when(fs.read(path, "rb"), function (data) {
                        var fs = Zip(data);
                        return Q.when(fs, function (fs) {
                            return {
                                "fs": fs,
                                "http": http,
                                "path": "/",
                                "href": baseUrl + path + '#/'
                            };
                        });
                    });
                }
                // TODO tar tar.gz tgz
            }
            return {
                "fs": fs,
                "http": http,
                "path": path,
                "href": baseUrl + path
            };
        });
    } else if (/^https?:$/.test(parsed.protocol)) {
        url = URL.resolve(baseUrl, url);
        return Q.when(http.read(url), function (data) {
            var fs = Zip(data);
            return Q.when(fs, function (fs) {
                return {
                    "fs": fs,
                    "http": http,
                    "path": "/",
                    "href": url + "#/"
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
function canonical(url, options) {
    var http = options.http;
    var fs = options.fs;
    var baseUrl = options.href;
    var basePath = options.path;

    var parsed;
    if (typeof url === "string") {
        parsed = URL.parse(parsed);
    } else {
        parsed = url;
    }

    var protocol = parsed.protocol;
    if (protocol === undefined) {
        if (!basePath && baseUrl) {
            url = URL.resolve('http:', url);
        } else {
            url = URL.resolve('file:', url);
        }
        parsed = URL.parse(url);
        protocol = parsed.protocol;
    }

    if (protocol === 'file:') {
        var path = parsed.pathname || '';
        if (basePath)
            path = fs.join(basePath, path);
        if (!fs)
            return Q.reject("Can't access the file system via " + parsed.href);
        return Q.when(fs.canonical(path), function (path) {
            return URL.resolve('file:/', path);
        });
    } else if (/^https?:$/.test(protocol)) {
        if (baseUrl)
            url = URL.resolve(baseUrl, url);
        if (!http)
            return Q.reject("Can't access the web via " + parsed.href);
        return Q.ref(url);
    } else {
        throw new Error("Can't canonicalize " + JSON.stringify(url));
    }
}

function Zip(data) {
    return Mock(new ZIP.Reader(data).toObject()).reroot();
}

