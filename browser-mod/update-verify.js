/* Signature + version helpers for the extension's self-update. Loaded by the
 * background worker (importScripts) and by test-update-verify.js in Node.
 *
 * A feature payload is trusted only if its exact bytes carry a valid Ed25519
 * signature from the release key — the same key cc_updater.py checks (kept in
 * sync by `cc_publish.py keygen`). The update server is just a file host. */
"use strict";

const CC_UPDATE_PUBLIC_KEY = "d6efc4a53e3e3f806fb5d99228a0bcbb4f19f70aea61c9d8e8de5adc4fbdb99c";

function ccHexToBytes(hex) {
  const clean = String(hex || "").trim();
  if (!/^([0-9a-f]{2})*$/i.test(clean)) throw new Error("bad hex");
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i += 1) out[i] = parseInt(clean.substr(i * 2, 2), 16);
  return out;
}

async function ccVerifySignature(bytes, sigHex, pubHex = CC_UPDATE_PUBLIC_KEY) {
  const key = await crypto.subtle.importKey("raw", ccHexToBytes(pubHex),
    { name: "Ed25519" }, false, ["verify"]);
  return crypto.subtle.verify({ name: "Ed25519" }, key, ccHexToBytes(sigHex), bytes);
}

function ccVersionParts(v) {
  return String(v || "0").split(".").map(part => Number(part) || 0);
}

function ccIsNewer(latest, current) {
  const a = ccVersionParts(latest), b = ccVersionParts(current);
  for (let i = 0; i < Math.max(a.length, b.length); i += 1) {
    if ((a[i] || 0) !== (b[i] || 0)) return (a[i] || 0) > (b[i] || 0);
  }
  return false;
}

if (typeof module !== "undefined") {
  module.exports = { CC_UPDATE_PUBLIC_KEY, ccHexToBytes, ccVerifySignature, ccVersionParts, ccIsNewer };
}
