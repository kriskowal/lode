"use strict";

// Copyright (C) 2009 Google Inc.
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
 * Cleanse this frame or die trying.
 *
 * <p>Should be called before any other potentially dangerous script
 * is executed in this frame. If it succeeds, the new global bindings
 * for <tt>eval</tt> and <tt>Function</tt> in this frame will only
 * load code according to the <i>loader isolation</i> rules of the
 * object-capability model. If all other code executed directly in
 * this frame (i.e., other than through these <tt>eval</tt> and
 * <tt>Function</tt> bindings) takes care to uphold object-capability
 * rules, then untrusted code loaded via <tt>eval</tt> and
 * <tt>Function</tt> will be constrained by those rules.
 *
 * <p>On a pre-ES5 browser, this script will fail cleanly, leaving the
 * frame intact. Otherwise, if this script fails, it may leave this
 * frame in an unusable state. All following description assumes this
 * script succeeds and that the browser conforms to the ES5 spec. The
 * ES5 spec allows browsers to implement more than is specified as
 * long as certain invariants are maintained. We further assume that
 * these extensions are not maliciously designed to obey the letter of
 * these invariants while subverting the intent of the spec. In other
 * words, even on an ES5 conformant browser, we do not presume to
 * defend ourselves from a browser that is out to get us.
 *
 * @param global ::Record(any) Assumed to be the real global object for
 *        this frame. Since initSES will allow global variable
 *        references that appear at the top level of the whitelist,
 *        our safety depends on these variables being frozen as a side
 *        effect of freezing the corresponding properties of
 *        <tt>global</tt>. These properties are also duplicated onto a
 *        <i>root accessible primordial</i>, which is provided as the
 *        <tt>this</tt> binding for hermetic eval calls -- emulating
 *        the safe subset of the normal global object.
 * @param whitelist ::Record(Permit)
 *            where Permit = true | "*" | "skip" | Record(Permit).
 *        Describes the subset of naming paths starting from the root
 *        that should be accessible. The <i>accessible primordials</i>
 *        are this root plus all values found by navigating these paths
 *        starting from this root. All non-whitelisted properties of
 *        accessible primordials are deleted, and then all accessible
 *        primordials are frozen with the whitelisted properties
 *        frozen as data properties.
 * @param atLeastFreeVarNames ::F([string], Record(true))
 *        Given the sourceText for a strict Program,
 *        atLeastFreeVarNames(sourceText) returns a Record whose
 *        enumerable property names must include the names of all the
 *        free variables occuring in sourceText. It can include as
 *        many other strings as is convenient so long as it includes
 *        these. The value of each of these properties should be
 *        {@code true}.
 */
/////////////// KLUDGE SWITCHES ///////////////

//var SHOULD_BE_NULL = null;
var SHOULD_BE_NULL = Object.prototype;

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

//////////////// END KLUDGE SWITCHES ///////////

/**
 * The result should include at least all the free variable names of
 * {@code programSrc}.
 *
 * Assuming that programSrc that parses as a strict Program,
 * atLeastFreeVarNames(programSrc) returns a Record whose enumerable
 * property names must include the names of all the free variables
 * occuring in programSrc. It can include as many other strings as is
 * convenient so long as it includes these. The value of each of these
 * properties should be {@code true}.
 */
exports.allPossibleFreeNames = allPossibleFreeNames;
function allPossibleFreeNames(programSrc) {
    programSrc = String(programSrc);
    LIMIT_SRC(programSrc);
    // Now that we've temporarily limited our attention to ascii...
    var ident = SHOULD_MATCH_IDENTIFIER;
    var result = Object.create(SHOULD_BE_NULL);
    var a;
    while ((a = ident.exec(programSrc))) {
        if (validName(a[0]))
            result[a[0]] = true;
    }
    return result;
}

function validName (name) {
    if (!cache[name]) {
        var valid = true;
        try {
            eval("(function(" + name + "){})");
        } catch (exception) {
            valid = false;
        }
        cache[name] = valid;
    }
    return cache[name];
}

var cache = {};

