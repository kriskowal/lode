
// -- kriskowal Kris Kowal Copyright (C) 2009-2010 MIT License
// requirePattern from http://code.google.com/p/es-lab/source/browse/trunk/src/ses/initSES.js
// -- - Google, Inc. Copyright (C) 2009 Apache 2.0 License

/////////////// KLUDGE SWITCHES ///////////////

function LIMIT_SRC(programSrc) {
    if (!((/^[\u0000-\u007f]*$/m).test(programSrc))) {
        throw new Error('Non-ascii texts not yet supported');
    }
}

// This is safe only because of the above LIMIT_SRC
// To do this right takes quite a lot of unicode machinery. See
// the "Identifier" production at
// http://es-lab.googlecode.com/svn/trunk/src/parser/es5parser.ojs
// which depends on
// http://es-lab.googlecode.com/svn/trunk/src/parser/unicode.js
var SHOULD_MATCH_IDENTIFIER = (/(\w|\$)+/gm);


/////////////////////////////////
// The following are only the minimal kludges needed for the current
// Mozilla Minefield (Firefox Beta) or Chromium Beta. At the time of
// this writing, these are Mozilla 4.0b5pre and Chromium 6.0.490.0
// (3135). As these move forward, kludges can be removed until we
// simply rely on ES5.

//var SHOULD_BE_NULL = null;
var SHOULD_BE_NULL = Object.prototype;

//////////////// END KLUDGE SWITCHES ///////////

var VM = require("vm");

exports.Module = function (text, fileName, lineNo) {
    var factory = function (inject) {
        var names = [];
        for (var name in inject)
            if (Object.prototype.hasOwnProperty.call(inject, name))
                names.push(name);
        var factory;
        try {
            factory = VM.runInThisContext(
                Array(lineNo).join("\n") +
                "(function(" + names.join(",") + "){" + text + "\n})",
                fileName
            );
        } catch (exception) {
            throw new Error(
                exception + " while compiling " +
                fileName + ":" + lineNo
            );
        }
        return factory.apply(null, names.map(function (name) {
            return inject[name];
        }));
    };
    // not necessary with package-level modules
    factory.requirements = [];
    //factory.requirements = exports.getRequirements(text);
    return factory;
};

// http://code.google.com/p/es-lab/source/browse/trunk/src/ses/initSES.js
var requirePattern = (/require\s*\(\s*(['"])((?:\w|\$|\.|\/)+)\1\s*\)/m);

exports.getRequirements = function (text) {
    var result = [];
    var statements = text.split(';');
    var i = 0, ii = statements.length;
    for (; i < ii; i++) {
    var match = requirePattern.exec(statements[i]);
        if (!match) break;
        result.push(match[2]);
    }
    return result;
};

