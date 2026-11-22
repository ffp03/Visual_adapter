// Page-derived markup never shares a document with extension controls.
(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    else root.ReaderFrame = api;
})(globalThis, function () {
    'use strict';
    function build(html, document, css, settings = {}) {
        const parsed = new document.defaultView.DOMParser().parseFromString(html || '', 'text/html');
        parsed.querySelectorAll('script,style,link,meta,base,iframe,object,embed,input,textarea,select,button,option,datalist,output,meter,progress').forEach(n => n.remove());
        parsed.querySelectorAll('label,form,fieldset,legend').forEach(n => n.replaceWith(...n.childNodes));
        parsed.querySelectorAll('*').forEach(n => [...n.attributes].forEach(a => {
            if (['id', 'for', 'form', 'autofocus'].includes(a.name) || /^on/i.test(a.name)) n.removeAttribute(a.name);
        }));
        const result = document.implementation.createHTMLDocument('Reading view');
        result.documentElement.lang = 'en';
        const style = result.createElement('style');
        style.textContent = css + '\nhtml,body{height:auto;min-height:100%;display:block;overflow:auto;}body{margin:0;background:var(--panel-bg);}'
            + '#reader-view{display:block;overflow:visible;min-height:0;padding:20px;overflow-wrap:anywhere;background:var(--panel-bg);}'
            + '#reader-view table{max-width:100%;}';
        result.head.append(style);
        const theme = ['black-white', 'white-black', 'yellow-black', 'blue-yellow', 'sepia', 'green-black'].includes(settings.theme) ? settings.theme : 'black-white';
        result.body.className = 'theme-' + theme;
        result.body.style.setProperty('--font-size', Math.max(12, Math.min(40, Number(settings.fontSize) || 20)) + 'px');
        result.body.style.fontFamily = settings.fontFamily || 'sans-serif';
        const content = result.createElement('main');
        // This trusted wrapper is added AFTER removal of all page-derived ids.
        content.id = 'reader-view';
        content.append(...[...parsed.body.childNodes].map(n => result.importNode(n, true)));
        result.body.append(content);
        return '<!doctype html>' + result.documentElement.outerHTML;
    }
    return { build };
});
