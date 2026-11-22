const { test, afterEach } = require('node:test'), assert = require('node:assert/strict');
const v3 = require('../../../extension/procedure-v3.js');
const { doc, close, prose } = require('./helpers.cjs');
afterEach(close);
function oldBlocks(d) {
    return v3.matches(d, v3.SUBSTANTIVE).map(node => {
        const sanitized = v3.clean(node, d), value = v3.text(sanitized), sidebar = !!node.closest(v3.SIDEBAR);
        const protectedText = sidebar ? '' : v3.nonSidebarText(sanitized);
        // The independent uncached path preserves original anchor ancestry,
        // which a detached sanitized paragraph cannot recover.
        return { node, text: value, characters: value.length, linkDensity: v3.linkDensity(sanitized), sidebar,
            protectedText, protectedCharacters: protectedText.length };
    }).filter(b => b.characters >= 40 && b.linkDensity < .5);
}
test('cached block measurement preserves sanitization, original anchor ancestry, sidebars and nested text', () => {
    const d = doc('<nav><p>'+prose('Global')+'</p></nav><main class="reading"><p>'+prose('Lead')
        + '<button>Button secret</button><textarea>Textarea secret</textarea><select><option>Choice secret</option></select></p>'
        + '<ul><li>'+prose('List')+'<aside><p>'+prose('Sidebar')+'</p></aside><p>'+prose('Nested')+'</p></li></ul>'
        + '<p>'+prose('Links')+'<a href="javascript:bad">unsafe link</a><a href="/ok">safe link</a></p>'
        + '<a href="/outer"><p>'+prose('Block inside link')+'</p></a>'
        + '<blockquote><p>'+prose('Quoted')+'</p><nav>'+prose('In-content nav')+'</nav></blockquote>'
        + '<pre>code '+prose('Unicode Ａ')+'</pre><footer><p>'+prose('Footer')+'</p></footer></main>');
    const before = d.body.innerHTML, expected = oldBlocks(d), actual = v3.blocks(d);
    assert.deepEqual(actual, expected); assert.equal(d.body.innerHTML, before);
});
test('large inventories sanitize one body instead of cloning each block and each link', () => {
    const d = doc('<main class="reading">'+Array.from({length:400}, (_,i)=>'<p>'+prose('Paragraph '+i)+'<a href="/link">Link</a></p>').join('')+'</main>');
    const prototype = d.defaultView.Node.prototype, original = prototype.cloneNode; let clones = 0;
    prototype.cloneNode = function(...args) { clones++; return original.apply(this,args); };
    try { assert.equal(v3.blocks(d).length,400); assert.ok(clones <= 2, 'clone count '+clones); }
    finally { prototype.cloneNode = original; }
    const output = d.createElement('div'); output.cloneNode = () => { throw Error('empty coverage must not clone'); };
    assert.deepEqual(v3.coverage([], output), {ratio:1,characters:0,kept:0,total:0,missing:[]});
});
test('diagnostic first lines stop measuring once four nonempty blocks are found', () => {
    const d=doc('<main></main>'),{firstLines}=require('../../../backend/agent/develop.cjs'),original=v3.text;let measured=0;
    v3.text=(...args)=>{measured++;return original(...args);};
    try{assert.deepEqual(firstLines(d,'<h1>Title</h1>'+Array.from({length:400},(_,i)=>'<p>Paragraph '+i+'</p>').join('')),['Title','Paragraph 0','Paragraph 1','Paragraph 2']);assert.equal(measured,4);}
    finally{v3.text=original;}
});
