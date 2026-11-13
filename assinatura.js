// Módulo Assinatura Digital — núcleo criptográfico e certificado salvo no aparelho.
// Complementa o script da aba "Assinatura Digital" (index.html.html).
//
// - dsCriarCms: monta a assinatura CMS no padrão CAdES-BES (com o atributo
//   signing-certificate-v2, exigido pelo PAdES e pelos validadores ICP-Brasil).
// - dsEscolherCertTitular: identifica, dentro do .pfx, o certificado que
//   corresponde à chave privada (e não simplesmente o primeiro da lista).
// - dsCofre*: guarda o arquivo .pfx (ainda protegido pela senha) somente no
//   navegador deste aparelho, para não precisar selecioná-lo toda vez.
//   A senha NUNCA é gravada.

const DS_OID_SIGNING_CERT_V2 = '1.2.840.113549.1.9.16.2.47';

function dsSha256Bytes(bin) {
  const md = forge.md.sha256.create();
  md.update(bin);
  return md.digest().getBytes();
}

function dsBytesParaUint8(bin) {
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i) & 0xff;
  return out;
}

// Dentro do .pfx, devolve o certificado cuja chave pública casa com a chave privada.
function dsEscolherCertTitular(certs, key) {
  if (!certs || !certs.length) return null;
  if (key && key.n) {
    for (let i = 0; i < certs.length; i++) {
      const pk = certs[i].publicKey;
      if (pk && pk.n && pk.n.compareTo(key.n) === 0) return certs[i];
    }
  }
  return certs[0];
}

// Ordena a cadeia: titular primeiro, depois cada emissor até a raiz.
function dsOrdenarCadeia(titular, certs) {
  const resto = (certs || []).filter(function (c) { return c !== titular; });
  const ordem = [titular];
  let atual = titular;
  for (let n = 0; n < 10; n++) {
    const idx = resto.findIndex(function (c) {
      try { return c.subject.hash === atual.issuer.hash && c !== atual; } catch (e) { return false; }
    });
    if (idx < 0) break;
    atual = resto.splice(idx, 1)[0];
    ordem.push(atual);
  }
  return ordem.concat(resto);
}

/**
 * Monta uma assinatura CMS/PKCS#7 destacada no perfil CAdES-BES.
 * @param {string} conteudoBin  conteúdo a assinar (string binária)
 * @param {object} opcoes       { incluirHora: boolean } — hora de assinatura como atributo
 *                              (use false no PAdES: a hora vai no dicionário do PDF)
 * @return {string} DER da assinatura (string binária)
 */
function dsCriarCms(conteudoBin, opcoes) {
  if (!_dsCert || !_dsKey) throw new Error('Certificado não carregado.');
  const asn1 = forge.asn1, oids = forge.pki.oids;
  const U = asn1.Class.UNIVERSAL, T = asn1.Type;
  const incluirHora = !opcoes || opcoes.incluirHora !== false;

  const oid = function (o) { return asn1.create(U, T.OID, false, asn1.oidToDer(o).getBytes()); };
  const seq = function (v) { return asn1.create(U, T.SEQUENCE, true, v); };
  const set = function (v) { return asn1.create(U, T.SET, true, v); };
  const oct = function (b) { return asn1.create(U, T.OCTETSTRING, false, b); };
  const nulo = function () { return asn1.create(U, T.NULL, false, ''); };
  const algSha256 = function () { return seq([oid(oids.sha256), nulo()]); };

  const certAsn1 = forge.pki.certificateToAsn1(_dsCert);
  const certDer = asn1.toDer(certAsn1).getBytes();
  const tbs = certAsn1.value[0];
  // tbsCertificate: [0] versão, número de série, algoritmo, emissor...
  const temVersao = tbs.value[0].tagClass === asn1.Class.CONTEXT_SPECIFIC;
  const serialAsn1 = tbs.value[temVersao ? 1 : 0];
  const emissorAsn1 = tbs.value[temVersao ? 3 : 2];

  // ----- atributos assinados -----
  const attrs = [
    seq([oid(oids.contentType), set([oid(oids.data)])]),
    seq([oid(oids.messageDigest), set([oct(dsSha256Bytes(conteudoBin))])]),
    // signing-certificate-v2: amarra a assinatura a ESTE certificado
    seq([oid(DS_OID_SIGNING_CERT_V2), set([
      seq([seq([seq([
        oct(dsSha256Bytes(certDer)),
        seq([
          seq([asn1.create(asn1.Class.CONTEXT_SPECIFIC, 4, true, [asn1.copy(emissorAsn1)])]),
          asn1.copy(serialAsn1)
        ])
      ])])])
    ])])
  ];
  if (incluirHora) {
    attrs.push(seq([oid(oids.signingTime), set([
      asn1.create(U, T.UTCTIME, false, asn1.dateToUtcTime(new Date()))
    ])]));
  }
  // DER exige o SET OF ordenado pela codificação de cada elemento
  attrs.sort(function (a, b) {
    const da = asn1.toDer(a).getBytes(), db = asn1.toDer(b).getBytes();
    return da < db ? -1 : (da > db ? 1 : 0);
  });

  // A assinatura é calculada sobre o SET (tag 0x31) dos atributos
  const md = forge.md.sha256.create();
  md.update(asn1.toDer(set(attrs)).getBytes());
  const assinatura = _dsKey.sign(md);

  const signerInfo = seq([
    asn1.create(U, T.INTEGER, false, asn1.integerToDer(1).getBytes()),
    seq([asn1.copy(emissorAsn1), asn1.copy(serialAsn1)]),
    algSha256(),
    asn1.create(asn1.Class.CONTEXT_SPECIFIC, 0, true, attrs),
    seq([oid(oids.rsaEncryption), nulo()]),
    oct(assinatura)
  ]);

  const cadeia = dsOrdenarCadeia(_dsCert, (_dsCerts && _dsCerts.length) ? _dsCerts : [_dsCert]);
  const certsAsn1 = cadeia.map(function (c) {
    return c === _dsCert ? certAsn1 : forge.pki.certificateToAsn1(c);
  });

  const signedData = seq([
    asn1.create(U, T.INTEGER, false, asn1.integerToDer(1).getBytes()),
    set([algSha256()]),
    seq([oid(oids.data)]),
    asn1.create(asn1.Class.CONTEXT_SPECIFIC, 0, true, certsAsn1),
    set([signerInfo])
  ]);

  const contentInfo = seq([
    oid(oids.signedData),
    asn1.create(asn1.Class.CONTEXT_SPECIFIC, 0, true, [signedData])
  ]);
  return asn1.toDer(contentInfo).getBytes();
}

// ===================== CERTIFICADO SALVO NESTE APARELHO =====================
// Guarda os bytes do .pfx (que continua cifrado pela senha) no IndexedDB do navegador.

const DS_COFRE_DB = 'atlas-assinatura';
const DS_COFRE_STORE = 'certificado';

function dsCofreAbrir() {
  return new Promise(function (resolve, reject) {
    if (!window.indexedDB) return reject(new Error('Navegador sem suporte a armazenamento local.'));
    const req = indexedDB.open(DS_COFRE_DB, 1);
    req.onupgradeneeded = function () { req.result.createObjectStore(DS_COFRE_STORE); };
    req.onsuccess = function () { resolve(req.result); };
    req.onerror = function () { reject(req.error); };
  });
}

async function dsCofreOperar(modo, fn) {
  const db = await dsCofreAbrir();
  return new Promise(function (resolve, reject) {
    const tx = db.transaction(DS_COFRE_STORE, modo);
    const r = fn(tx.objectStore(DS_COFRE_STORE));
    tx.oncomplete = function () { db.close(); resolve(r && r.result); };
    tx.onerror = function () { db.close(); reject(tx.error); };
  });
}

function dsCofreSalvar(bytes, nome) {
  return dsCofreOperar('readwrite', function (s) {
    return s.put({ bytes: bytes, nome: nome || 'certificado.pfx', salvoEm: new Date().toISOString() }, 'pfx');
  });
}
function dsCofreLer() {
  return dsCofreOperar('readonly', function (s) { return s.get('pfx'); }).catch(function () { return null; });
}
function dsCofreApagar() {
  return dsCofreOperar('readwrite', function (s) { return s.delete('pfx'); }).catch(function () { return null; });
}

// Atualiza o aviso "certificado salvo neste aparelho" na aba
async function dsCofreAtualizarUI() {
  const el = document.getElementById('ds-cofre-info');
  if (!el) return;
  const reg = await dsCofreLer();
  if (reg && reg.bytes) {
    const quando = reg.salvoEm ? new Date(reg.salvoEm).toLocaleDateString('pt-BR') : '';
    el.style.display = 'block';
    el.innerHTML = '💾 <strong>Certificado salvo neste aparelho:</strong> ' + esc(reg.nome || '') +
      (quando ? ' (desde ' + quando + ')' : '') +
      '. Informe apenas a <strong>senha</strong> e clique em <strong>Carregar Certificado</strong>. ' +
      '<button type="button" class="btn btn-ghost btn-sm" onclick="dsCofreEsquecer()">Esquecer neste aparelho</button>';
  } else {
    el.style.display = 'none';
    el.innerHTML = '';
  }
}

async function dsCofreEsquecer() {
  await dsCofreApagar();
  await dsCofreAtualizarUI();
  toastMsg('Certificado apagado deste aparelho.', 'info');
}

document.addEventListener('DOMContentLoaded', function () {
  dsCofreAtualizarUI();
  const senha = document.getElementById('ds-senha');
  if (senha) senha.addEventListener('keydown', function (e) {
    if (e.key === 'Enter') { e.preventDefault(); dsCarregarPfx(); }
  });
});

// ===================== BIBLIOTECA PAdES (carregada sob demanda) =====================
let _dsPadesPromise = null;
function dsCarregarBibliotecaPades() {
  if (window.AtlasPades) return Promise.resolve(window.AtlasPades);
  if (_dsPadesPromise) return _dsPadesPromise;
  _dsPadesPromise = new Promise(function (resolve, reject) {
    const s = document.createElement('script');
    s.src = 'assinatura-pades.vendor.js';
    s.onload = function () {
      if (window.AtlasPades) resolve(window.AtlasPades);
      else reject(new Error('Biblioteca de assinatura PAdES não inicializou.'));
    };
    s.onerror = function () {
      _dsPadesPromise = null;
      reject(new Error('Não foi possível carregar a biblioteca de assinatura (verifique a internet).'));
    };
    document.head.appendChild(s);
  });
  return _dsPadesPromise;
}
