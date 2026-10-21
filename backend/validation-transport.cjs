const { gunzipSync } = require('node:zlib');
const { validationLimits: limits } = require('../extension/procedure-core.js');
const own = (object, key) => Object.prototype.hasOwnProperty.call(object, key);

// Decode before any DOM parser sees the payload. Client metadata is not an
// attestation; the server still reconstructs and validates the entire DOM.
function decodeValidation(data) {
    const compressed = own(data, 'validationTransport');
    if (compressed && own(data, 'validationHTML')) throw Error('Ambiguous validation context fields');
    if (!compressed) {
        if (data.validationComplete !== true || typeof data.validationHTML !== 'string') return null;
        if (!data.validationHTML.trim() || data.validationHTML.length > limits.legacyCharacters) throw Error('Uncompressed validation exceeds legacy 100k bound');
        return { html: data.validationHTML, compressed: false };
    }
    const transport = data.validationTransport;
    if (data.validationComplete !== true || !transport || typeof transport !== 'object' || Array.isArray(transport)) throw Error('Invalid compressed validation context');
    if (Object.keys(transport).sort().join(',') !== 'data,decodedBytes,encoding' || transport.encoding !== limits.encoding) throw Error('Unsupported validation transport');
    if (!Number.isSafeInteger(transport.decodedBytes) || transport.decodedBytes < 1 || transport.decodedBytes > limits.decodedBytes) throw Error('Invalid decoded validation byte count');
    const encoded = transport.data;
    if (typeof encoded !== 'string' || !encoded.length || encoded.length > 4 * Math.ceil(limits.compressedBytes / 3)
        || encoded.length % 4 || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(encoded)) throw Error('Invalid canonical validation base64');
    const bytes = Buffer.from(encoded, 'base64');
    if (bytes.length > limits.compressedBytes || bytes.toString('base64') !== encoded) throw Error('Invalid compressed validation byte bound');
    if (transport.decodedBytes > bytes.length * limits.expansionRatio) throw Error('Validation expansion ratio exceeds bound');
    let decoded;
    try { decoded = gunzipSync(bytes, { maxOutputLength: limits.decodedBytes }); }
    catch { throw Error('Invalid or oversized validation gzip'); }
    if (decoded.length !== transport.decodedBytes) throw Error('Decoded validation byte count mismatch');
    if (decoded.length > bytes.length * limits.expansionRatio) throw Error('Validation expansion ratio exceeds bound');
    let html;
    try { html = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(decoded); }
    catch { throw Error('Invalid validation UTF-8'); }
    if (!html.trim()) throw Error('Empty decoded validation context');
    return { html, compressed: true };
}
module.exports = { decodeValidation, limits };
