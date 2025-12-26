import React, { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { ethers } from "ethers";
import CryptoJS from "crypto-js";
import "./styles.css";

// ======================= CONFIG =======================
const CONTRACT_ADDRESS = "0x5FbDB2315678afecb367f032d93F642f64180aa3";
const FILE_API_URL = "http://localhost:5001";

// ======================= ABI =======================
// ✅ On garde l’ABI complète utile au projet,
// ❌ mais côté React on SUPPRIME totalement la gestion des clés étudiant (priv/pub).
const CONTRACT_ABI = [
  "function administrateur() public view returns (address)",

  "function inscrireEnseignant(address _adresse, string _nom) external",
  "function inscrireEtudiant(address _adresse, string _nom, string _numeroEtudiant) external",

  "function creerModule(string _nom, uint256 _coefficient, address _enseignant) external returns (uint256)",
  "function obtenirModules() external view returns (tuple(uint256 id, string nom, uint256 coefficient, address enseignant, bool estActif)[])",

  "function affecterEtudiantAuModule(uint256 _moduleId, address _etudiant) external",
  "function obtenirEtudiantsModule(uint256 _moduleId) external view returns (address[])",
  "function estInscritDansModule(uint256 _moduleId, address _etudiant) external view returns (bool)",

  "function definirClePubliqueEnseignant(string _clePublique) external",
  // "function definirClePubliqueEtudiant(string _clePublique) external", // ❌ plus utilisé côté UI

  "function creerDevoir(uint256 _moduleId, string _titre, string _description, string _clePubliqueChiffrement, uint256 _dateLimite) external returns (uint256)",
  "function corrigerSoumission(uint256 _soumissionId, uint256 _note, string _commentaire, string _fichierCorrectionHash, string _fichierCorrectionNom, string _fichierCorrectionURI) external",

  "function soumettreDevoir(uint256 _devoirId, string _contenuChiffre, string _identiteChiffree, string _fichierHash, string _fichierNom, string _fichierType, string _fichierURI, string _cleAESChiffree) external returns (uint256)",

  "function obtenirTousLesDevoirs() external view returns (uint256[])",

  "function obtenirDevoir(uint256 _devoirId) external view returns (tuple(uint256 id, address enseignant, uint256 moduleId, string titre, string description, string clePubliqueChiffrement, uint256 dateCreation, uint256 dateLimite, bool estActif))",

  "function obtenirSoumission(uint256 _soumissionId) external view returns (tuple(uint256 id, uint256 devoirId, uint256 moduleId, address etudiant, string contenuChiffre, string identiteChiffree, tuple(string hash, string nom, string fileType, string uri, string cleAESChiffree) fichier, uint256 dateSubmission, bool estCorrige, uint256 note, string commentaire, tuple(string hash, string nom, string uri) fichierCorrection))",

  "function obtenirSoumissionsDevoir(uint256 _devoirId) external view returns (uint256[])",
  "function obtenirSoumissionsEtudiant(address _etudiant) external view returns (uint256[])",

  "function estEnseignant(address _adresse) external view returns (bool)",
  "function estEtudiant(address _adresse) external view returns (bool)",

  "function enseignants(address) external view returns (address adresse, string nom, string clePublique, bool estActif, uint256 dateInscription, uint256 moduleId)",
  "function etudiants(address) external view returns (address adresse, string nom, string numeroEtudiant, string clePublique, bool estActif, uint256 dateInscription)",

  "function obtenirNotesEtudiant(address _etudiant) external view returns (uint256[] soumissionIds, uint256[] notes, uint256[] moduleIds)",

  "function publierAnnonce(string _titre, string _contenu, bool _estPublique) external returns (uint256)",
];

// ======================= UPLOAD HELPERS =======================
async function uploadFileToServer(fileOrBlob, filename) {
  const form = new FormData();
  if (fileOrBlob instanceof Blob) form.append("file", fileOrBlob, filename || "encrypted.bin");
  else form.append("file", fileOrBlob);

  const res = await fetch(`${FILE_API_URL}/upload`, { method: "POST", body: form });
  if (!res.ok) throw new Error("Upload échoué");
  return await res.json(); // { uri }
}

function stringToBlob(str) {
  return new Blob([str], { type: "application/octet-stream" });
}

async function fetchTextFromUri(uri) {
  const res = await fetch(uri);
  if (!res.ok) throw new Error("Téléchargement échoué");
  return await res.text();
}

async function downloadFromUri(uri, filename) {
  const res = await fetch(uri);
  if (!res.ok) throw new Error("Téléchargement échoué");
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename || "download.bin";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// ✅ télécharger un blob (ex: fichier déchiffré)
function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename || "download.bin";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

async function copyToClipboard(text) {
  if (!text) return;
  try {
    await navigator.clipboard.writeText(text);
    alert("✅ Copié dans le presse-papiers !");
  } catch {
    const ta = document.createElement("textarea");
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand("copy");
    ta.remove();
    alert("✅ Copié (fallback) !");
  }
}

async function pasteFromClipboard() {
  try {
    const t = await navigator.clipboard.readText();
    return t || "";
  } catch {
    alert("❌ Permission presse-papiers refusée. Colle manuellement (Ctrl+V).");
    return "";
  }
}

// ======================= CRYPTO =======================
class CryptoUtils {
  static normalizeBase64(b64) {
    return (b64 || "").replace(/\s+/g, "").trim();
  }

  // RSA-OAEP 2048 via WebCrypto
  static async generateRSAKeyPair() {
    const keyPair = await window.crypto.subtle.generateKey(
      {
        name: "RSA-OAEP",
        modulusLength: 2048,
        publicExponent: new Uint8Array([1, 0, 1]),
        hash: "SHA-256",
      },
      true,
      ["encrypt", "decrypt"]
    );

    const publicKey = await window.crypto.subtle.exportKey("spki", keyPair.publicKey);
    const privateKey = await window.crypto.subtle.exportKey("pkcs8", keyPair.privateKey);

    return {
      publicKey: this.arrayBufferToBase64(publicKey),
      privateKey: this.arrayBufferToBase64(privateKey),
    };
  }

  static arrayBufferToBase64(buffer) {
    return btoa(String.fromCharCode(...new Uint8Array(buffer)));
  }

  static base64ToArrayBuffer(base64) {
    const b64 = this.normalizeBase64(base64);
    if (!b64) throw new Error("Base64 vide");
    const binaryString = atob(b64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) bytes[i] = binaryString.charCodeAt(i);
    return bytes.buffer;
  }

  static async importPublicKey(base64Spki) {
    const publicKeyData = this.base64ToArrayBuffer(base64Spki);
    return window.crypto.subtle.importKey(
      "spki",
      publicKeyData,
      { name: "RSA-OAEP", hash: "SHA-256" },
      false,
      ["encrypt"]
    );
  }

  static async importPrivateKey(base64Pkcs8) {
    const privateKeyData = this.base64ToArrayBuffer(base64Pkcs8);
    return window.crypto.subtle.importKey(
      "pkcs8",
      privateKeyData,
      { name: "RSA-OAEP", hash: "SHA-256" },
      false,
      ["decrypt"]
    );
  }

  static async rsaEncrypt(message, publicKeyBase64) {
    const pk = this.normalizeBase64(publicKeyBase64);
    if (!pk) throw new Error("Clé publique vide");
    const encoder = new TextEncoder();
    const publicKey = await this.importPublicKey(pk);
    const encrypted = await window.crypto.subtle.encrypt({ name: "RSA-OAEP" }, publicKey, encoder.encode(message));
    return this.arrayBufferToBase64(encrypted);
  }

  static async rsaDecrypt(encryptedBase64, privateKeyBase64) {
    const sk = this.normalizeBase64(privateKeyBase64);
    if (!sk) throw new Error("Clé privée vide");

    const ct = this.normalizeBase64(encryptedBase64);
    if (!ct) throw new Error("Ciphertext vide");

    const privateKey = await this.importPrivateKey(sk);
    const decoder = new TextDecoder();
    const decrypted = await window.crypto.subtle.decrypt(
      { name: "RSA-OAEP" },
      privateKey,
      this.base64ToArrayBuffer(ct)
    );
    return decoder.decode(decrypted);
  }

  // AES (CryptoJS)
  static generateAESKey() {
    return CryptoJS.lib.WordArray.random(32).toString();
  }

  static encryptFileContentToString(file, aesKey) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error("Erreur lecture fichier"));
      reader.onload = () => {
        const arrayBuffer = reader.result;
        const wordArray = CryptoJS.lib.WordArray.create(arrayBuffer);
        const encrypted = CryptoJS.AES.encrypt(wordArray, aesKey).toString();
        resolve({
          encryptedContent: encrypted,
          name: file.name,
          type: file.type || "application/octet-stream",
          size: file.size,
        });
      };
      reader.readAsArrayBuffer(file);
    });
  }

  static decryptAesStringToBytes(encryptedString, aesKey) {
    const decrypted = CryptoJS.AES.decrypt(encryptedString, aesKey);
    const words = decrypted.words;
    const sigBytes = decrypted.sigBytes;

    const u8 = new Uint8Array(sigBytes);
    for (let i = 0; i < sigBytes; i++) {
      u8[i] = (words[(i / 4) | 0] >> (24 - 8 * (i % 4))) & 0xff;
    }
    return u8;
  }
}

// ✅ TEST: Vérifie que la clé privée correspond à la clé publique stockée dans le DEVOIR
async function testKeyPairWithDevoirPubKey(privateKeyBase64, devoirPubKeyBase64) {
  const msg = "TEST_" + Date.now();
  const enc = await CryptoUtils.rsaEncrypt(msg, devoirPubKeyBase64);
  const dec = await CryptoUtils.rsaDecrypt(enc, privateKeyBase64);
  return dec === msg;
}

// ======================= SIMPLE PLAGIAT =======================
class AntiPlagiat {
  static detecter(texts) {
    if (texts.length < 2) return [];
    const vectors = texts.map((t) => this.textToVector(t));
    const out = [];
    for (let i = 0; i < vectors.length; i++) {
      for (let j = i + 1; j < vectors.length; j++) {
        const sim = this.cosine(vectors[i], vectors[j]);
        if (sim > 0.75) out.push({ paire: [i + 1, j + 1], score: Math.round(sim * 100) });
      }
    }
    return out;
  }
  static textToVector(text) {
    const mots =
      (text || "")
        .toLowerCase()
        .match(/\b[a-zA-Zàâäéèêëïîôöùûüç]{3,}\b/g) || [];
    const v = {};
    for (const m of mots) v[m] = (v[m] || 0) + 1;
    return v;
  }
  static cosine(a, b) {
    const keys = Object.keys({ ...a, ...b });
    let dot = 0,
      na = 0,
      nb = 0;
    for (const k of keys) {
      const x = a[k] || 0;
      const y = b[k] || 0;
      dot += x * y;
      na += x * x;
      nb += y * y;
    }
    const denom = Math.sqrt(na) * Math.sqrt(nb);
    return denom > 0 ? dot / denom : 0;
  }
}

// ======================= HASH (SHA-256) =======================
async function sha256Hex(message) {
  const msgBuffer = new TextEncoder().encode(message);
  const hashBuffer = await window.crypto.subtle.digest("SHA-256", msgBuffer);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function sha256FileHex(file) {
  const buffer = await file.arrayBuffer();
  const hashBuffer = await window.crypto.subtle.digest("SHA-256", buffer);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// ======================= DEVOIR ATTACHMENT PARSING =======================
function parseDevoirAttachment(description) {
  const desc = description || "";
  const uri = (desc.match(/URI:\s*(.+)/i) || [])[1]?.trim() || "";
  const nom = (desc.match(/Nom:\s*(.+)/i) || [])[1]?.trim() || "";
  const hash = (desc.match(/Hash:\s*(.+)/i) || [])[1]?.trim() || "";
  const type = (desc.match(/Type:\s*(.+)/i) || [])[1]?.trim() || "";
  if (!uri) return null;
  return { uri, nom, hash, type };
}

function stripAttachmentBlock(description) {
  const desc = description || "";
  const idx = desc.indexOf("\n\n---\n📎 FichierDevoir:");
  if (idx === -1) return desc;
  return desc.slice(0, idx).trim();
}

// ======================= LOCAL KEY STORAGE (PROF ONLY) =======================
function getTeacherLocalKeyName(account) {
  return `SGC_RSA_PRIV_TEACHER_${(account || "").toLowerCase()}`;
}

// ======================= APP =======================
export default function App() {
  // Wallet/contract
  const [provider, setProvider] = useState(null);
  const [signer, setSigner] = useState(null);
  const [contract, setContract] = useState(null);
  const [account, setAccount] = useState("");
  const [userRole, setUserRole] = useState("");
  const [activeTab, setActiveTab] = useState("home");

  // Data
  const [modules, setModules] = useState([]);
  const [devoirs, setDevoirs] = useState([]);
  const [teacherSubmissions, setTeacherSubmissions] = useState([]);
  const [studentSubmissions, setStudentSubmissions] = useState([]);
  const [studentGrades, setStudentGrades] = useState([]);

  const [assign, setAssign] = useState({ moduleId: "", studentAddress: "" });
  const [eligibleDevoirs, setEligibleDevoirs] = useState([]);

  // ✅ NEW: modules liés à l’étudiant (pour filtrage devoirs étudiant)
  const [studentModuleIds, setStudentModuleIds] = useState([]); // string[]

  // Forms (Admin)
  const [newTeacher, setNewTeacher] = useState({
    address: "",
    nom: "",
    moduleNom: "",
    coefficient: "",
  });
  const [newStudent, setNewStudent] = useState({ address: "", nom: "", numero: "" });

  const [newDevoir, setNewDevoir] = useState({
    moduleId: "",
    titre: "",
    description: "",
    dateLimite: "",
  });

  const [newSoumission, setNewSoumission] = useState({
    devoirId: "",
    identite: "",
    reponse: "",
  });

  const [correction, setCorrection] = useState({
    soumissionId: "",
    note: "",
    commentaire: "",
  });

  // Files + crypto UI
  const [selectedFile, setSelectedFile] = useState(null);
  const correctionFileRef = useRef(null);

  const devoirFileRef = useRef(null);
  const [devoirFile, setDevoirFile] = useState(null);

  // ✅ PROF ONLY: keys
  const [teacherPublicKeyOnChain, setTeacherPublicKeyOnChain] = useState("");
  const [teacherPrivateKeyLocal, setTeacherPrivateKeyLocal] = useState("");
  const [showMyPriv, setShowMyPriv] = useState(false);

  // Prof decrypt UI
  const [teacherPrivateKey, setTeacherPrivateKey] = useState("");
  const [decryptId, setDecryptId] = useState("");
  const [decryptedText, setDecryptedText] = useState("");

  // ✅ NOUVEAU: garder le fichier déchiffré en mémoire pour afficher un bouton "Download"
  const [decryptedFile, setDecryptedFile] = useState(null); // { blob, name, type }

  const [plagiarismResults, setPlagiarismResults] = useState([]);

  // Pour afficher clé publique prof aux étudiants
  const [selectedDevoirTeacherPubKey, setSelectedDevoirTeacherPubKey] = useState("");

  // ======================= ERROR HELPERS =======================
  const getEthersError = (e) =>
    e?.reason || e?.shortMessage || e?.info?.error?.message || e?.message || e?.toString?.() || "Erreur";

  const getCryptoErrorText = (e) => {
    const name = e?.name ? `${e.name}: ` : "";
    const msg = e?.message || e?.toString?.() || "Erreur";
    return name + msg;
  };

  // ======================= CONNECT WALLET =======================
  const connectWallet = async () => {
    try {
      if (!window.ethereum) {
        alert("Veuillez installer MetaMask !");
        return;
      }

      const prov = new ethers.BrowserProvider(window.ethereum);
      const accounts = await prov.send("eth_requestAccounts", []);
      const sign = await prov.getSigner();

      const network = await prov.getNetwork();
      if (network.chainId !== 31337n) {
        alert(
          `Attention : sélectionnez Hardhat localhost (chainId 31337). Réseau actuel: ${network.chainId.toString()}`
        );
      }

      setProvider(prov);
      setSigner(sign);
      setAccount(accounts[0]);

      const cont = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, sign);
      setContract(cont);

      await checkUserRole(cont, accounts[0]);
    } catch (e) {
      console.error(e);
      alert("Erreur connexion wallet: " + getEthersError(e));
    }
  };

  const checkUserRole = async (cont, addr) => {
    try {
      const isTeacher = await cont.estEnseignant(addr);
      const isStudent = await cont.estEtudiant(addr);
      const admin = await cont.administrateur();

      if (addr.toLowerCase() === admin.toLowerCase()) setUserRole("admin");
      else if (isTeacher) setUserRole("enseignant");
      else if (isStudent) setUserRole("etudiant");
      else setUserRole("non-inscrit");
    } catch (e) {
      console.error(e);
    }
  };

  // ======================= LOADERS =======================
  const loadModules = useCallback(async () => {
    if (!contract) return;
    try {
      const data = await contract.obtenirModules();
      setModules(
        data.map((m) => ({
          id: m.id.toString(),
          nom: m.nom,
          coefficient: Number(m.coefficient),
          enseignant: m.enseignant,
          estActif: m.estActif,
        }))
      );
    } catch (e) {
      console.error("Erreur modules:", e);
    }
  }, [contract]);

  const loadDevoirs = useCallback(async () => {
    if (!contract) return;
    try {
      const ids = await contract.obtenirTousLesDevoirs();
      const list = await Promise.all(
        ids.map(async (id) => {
          const d = await contract.obtenirDevoir(id);
          const attach = parseDevoirAttachment(d.description);
          return {
            id: d.id.toString(),
            moduleId: d.moduleId.toString(),
            titre: d.titre,
            description: stripAttachmentBlock(d.description),
            rawDescription: d.description,
            attachment: attach,
            enseignant: d.enseignant,
            clePublique: d.clePubliqueChiffrement,
            dateCreation: new Date(Number(d.dateCreation) * 1000).toLocaleString(),
            dateLimite: new Date(Number(d.dateLimite) * 1000).toLocaleString(),
            estActif: d.estActif,
          };
        })
      );
      setDevoirs(list);
    } catch (e) {
      console.error("Erreur devoirs:", e);
    }
  }, [contract]);

  // ✅ NEW: récupérer les moduleIds où l’étudiant est inscrit (pour filtrer page Devoirs)
  const loadStudentModuleIds = useCallback(async () => {
    if (!contract || !account || userRole !== "etudiant") {
      setStudentModuleIds([]);
      return;
    }
    try {
      const checks = await Promise.all(
        modules.map(async (m) => {
          try {
            const ok = await contract.estInscritDansModule(Number(m.id), account);
            return ok ? m.id : null;
          } catch {
            return null;
          }
        })
      );
      setStudentModuleIds(checks.filter(Boolean));
    } catch (e) {
      console.error("Erreur studentModuleIds:", e);
      setStudentModuleIds([]);
    }
  }, [contract, account, userRole, modules]);

  const loadEligibleDevoirsForStudent = useCallback(async () => {
    if (!contract || !account || userRole !== "etudiant") {
      setEligibleDevoirs([]);
      return;
    }
    try {
      const checks = await Promise.all(
        devoirs.map(async (d) => {
          try {
            const ok = await contract.estInscritDansModule(Number(d.moduleId), account);
            return { d, ok };
          } catch {
            return { d, ok: false };
          }
        })
      );
      const filtered = checks.filter((x) => x.ok).map((x) => x.d);
      setEligibleDevoirs(filtered);
    } catch (e) {
      console.error("Erreur eligible devoirs:", e);
      setEligibleDevoirs([]);
    }
  }, [contract, account, userRole, devoirs]);

  // ✅ FIX PROF: charger uniquement les soumissions des devoirs DU PROF (via devoir.enseignant)
  const loadTeacherSubmissions = useCallback(async () => {
    if (!contract || !account || userRole !== "enseignant") return;
    try {
      const myDevoirs = devoirs.filter((d) => d.enseignant.toLowerCase() === account.toLowerCase());

      const all = [];
      for (const d of myDevoirs) {
        const ids = await contract.obtenirSoumissionsDevoir(Number(d.id));
        for (const sid of ids) {
          const s = await contract.obtenirSoumission(sid);

          // ✅ FIX IDENTITY: l’étudiant est identifié par s.etudiant (msg.sender)
          all.push({
            id: s.id.toString(),
            devoirId: s.devoirId.toString(),
            moduleId: s.moduleId.toString(),
            etudiant: s.etudiant,

            contenuChiffre: s.contenuChiffre,
            identiteChiffree: s.identiteChiffree,

            fichierHash: s.fichier.hash,
            fichierNom: s.fichier.nom,
            fichierType: s.fichier.fileType,
            fichierURI: s.fichier.uri,
            cleAESChiffree: s.fichier.cleAESChiffree,

            dateSubmission: new Date(Number(s.dateSubmission) * 1000).toLocaleString(),
            estCorrige: s.estCorrige,
            note: Number(s.note),
            commentaire: s.commentaire,

            fichierCorrectionHash: s.fichierCorrection.hash,
            fichierCorrectionNom: s.fichierCorrection.nom,
            fichierCorrectionURI: s.fichierCorrection.uri,

            devoirTitre: d.titre,
          });
        }
      }
      setTeacherSubmissions(all);
    } catch (e) {
      console.error("Erreur soumissions enseignant:", e);
    }
  }, [contract, account, userRole, devoirs]);

  const loadStudentSubmissions = useCallback(async () => {
    if (!contract || !account || userRole !== "etudiant") return;
    try {
      const ids = await contract.obtenirSoumissionsEtudiant(account);
      const all = [];
      for (const sid of ids) {
        const s = await contract.obtenirSoumission(sid);
        const d = await contract.obtenirDevoir(s.devoirId);

        all.push({
          id: s.id.toString(),
          devoirId: s.devoirId.toString(),
          devoirTitre: d.titre,
          dateSubmission: new Date(Number(s.dateSubmission) * 1000).toLocaleString(),
          dateLimite: new Date(Number(d.dateLimite) * 1000).toLocaleString(),
          estCorrige: s.estCorrige,
          note: Number(s.note),
          commentaire: s.commentaire,

          fichierNom: s.fichier.nom,
          fichierType: s.fichier.fileType,
          fichierURI: s.fichier.uri,

          fichierCorrectionNom: s.fichierCorrection.nom,
          fichierCorrectionURI: s.fichierCorrection.uri,
          fichierCorrectionHash: s.fichierCorrection.hash,
        });
      }
      setStudentSubmissions(all);
    } catch (e) {
      console.error("Erreur soumissions étudiant:", e);
    }
  }, [contract, account, userRole]);

  const loadStudentGrades = useCallback(async () => {
    if (!contract || !account || userRole !== "etudiant") return;
    try {
      const [soumissionIds, notes, moduleIds] = await contract.obtenirNotesEtudiant(account);

      const rows = soumissionIds.map((sid, i) => ({
        soumissionId: sid.toString(),
        note: Number(notes[i]),
        moduleId: moduleIds[i].toString(),
      }));

      setStudentGrades(rows);
    } catch (e) {
      console.error("Erreur notes:", e);
    }
  }, [contract, account, userRole]);

  // ✅ PROF ONLY
  const loadTeacherPublicKeyFromChain = useCallback(async () => {
    if (!contract || !account || userRole !== "enseignant") {
      setTeacherPublicKeyOnChain("");
      return;
    }
    try {
      const t = await contract.enseignants(account);
      setTeacherPublicKeyOnChain(t.clePublique || "");
    } catch (e) {
      console.error("Erreur loadTeacherPublicKeyFromChain:", e);
      setTeacherPublicKeyOnChain("");
    }
  }, [contract, account, userRole]);

  // ======================= MOYENNE PONDÉRÉE =======================
  const calculerMoyennePonderee = () => {
    if (!studentGrades.length) return "0.00";
    const notesParModule = {};
    for (const g of studentGrades) {
      if (!notesParModule[g.moduleId]) notesParModule[g.moduleId] = [];
      notesParModule[g.moduleId].push(g.note);
    }

    let totalPondere = 0;
    let totalCoeff = 0;

    for (const [moduleId, notes] of Object.entries(notesParModule)) {
      const mod = modules.find((m) => m.id === moduleId);
      if (!mod) continue;
      const moy = notes.reduce((a, b) => a + b, 0) / notes.length;
      totalPondere += moy * mod.coefficient;
      totalCoeff += mod.coefficient;
    }

    return totalCoeff > 0 ? (totalPondere / totalCoeff).toFixed(2) : "0.00";
  };

  // ======================= ADMIN ACTIONS =======================
  const inscrireEnseignant = async () => {
    if (!contract || userRole !== "admin") return alert("Admin seulement");

    const { address, nom, moduleNom, coefficient } = newTeacher;

    if (!address || !nom || !moduleNom || coefficient === "") {
      return alert("Remplis: adresse, nom, nom du module, coefficient");
    }

    try {
      const tx1 = await contract.inscrireEnseignant(address, nom);
      await tx1.wait();

      const tx2 = await contract.creerModule(moduleNom, Number(coefficient), address);
      await tx2.wait();

      alert("✅ Enseignant inscrit + module créé !");
      setNewTeacher({ address: "", nom: "", moduleNom: "", coefficient: "" });
      await loadModules();
    } catch (e) {
      console.error(e);
      alert("Erreur inscription enseignant: " + getEthersError(e));
    }
  };

  const inscrireEtudiant = async () => {
    if (!contract || userRole !== "admin") return alert("Admin seulement");
    const { address, nom, numero } = newStudent;
    if (!address || !nom || !numero) return alert("Remplis tous les champs étudiant");
    try {
      const tx = await contract.inscrireEtudiant(address, nom, numero);
      await tx.wait();
      alert("✅ Étudiant inscrit !");
      setNewStudent({ address: "", nom: "", numero: "" });
    } catch (e) {
      console.error(e);
      alert("Erreur inscription étudiant: " + getEthersError(e));
    }
  };

  const affecterEtudiant = async () => {
    if (!contract || userRole !== "admin") return alert("Admin seulement");
    if (!assign.moduleId || !assign.studentAddress) return alert("Choisis module + adresse étudiant");
    try {
      const tx = await contract.affecterEtudiantAuModule(Number(assign.moduleId), assign.studentAddress);
      await tx.wait();
      alert("✅ Étudiant affecté au module !");
      setAssign({ moduleId: "", studentAddress: "" });
      // refresh
      await loadStudentModuleIds();
      await loadEligibleDevoirsForStudent();
    } catch (e) {
      console.error(e);
      alert("Erreur affectation: " + getEthersError(e));
    }
  };

  // ======================= PROFIL (PROF ONLY): KEYS =======================
  const loadTeacherPrivateKeyLocal = useCallback(() => {
    if (!account || userRole !== "enseignant") return setTeacherPrivateKeyLocal("");
    const key = localStorage.getItem(getTeacherLocalKeyName(account)) || "";
    setTeacherPrivateKeyLocal(key);
  }, [account, userRole]);

  const saveTeacherPrivateKeyLocal = useCallback(
    (priv) => {
      if (!account || userRole !== "enseignant") return;
      localStorage.setItem(getTeacherLocalKeyName(account), priv || "");
      setTeacherPrivateKeyLocal(priv || "");
    },
    [account, userRole]
  );

  const generateAndRegisterTeacherKeys = async () => {
    if (!contract || !account) return alert("Connecte le wallet d'abord");
    if (userRole !== "enseignant") return alert("Seul l’enseignant gère les clés RSA dans cette version.");

    try {
      const keys = await CryptoUtils.generateRSAKeyPair();
      saveTeacherPrivateKeyLocal(keys.privateKey);

      const tx = await contract.definirClePubliqueEnseignant(keys.publicKey);
      await tx.wait();

      await loadTeacherPublicKeyFromChain();

      alert(
        "✅ Clés PROF générées !\n\n🔐 Clé privée stockée localement.\n🔓 Clé publique enregistrée sur la blockchain.\n\n⚠️ Utilise cette clé privée pour déchiffrer les soumissions."
      );
    } catch (e) {
      console.error(e);
      alert("Erreur génération/enregistrement clés (prof): " + getEthersError(e));
    }
  };

  const pushPublicKeyOnly = async () => {
    const pk = (teacherPublicKeyOnChain || "").trim();
    if (!pk) return alert("Clé publique vide. Génère des clés d'abord.");
    alert("✅ Ta clé publique prof est bien disponible on-chain.");
  };

  // ======================= ENSEIGNANT: CRÉER DEVOIR =======================
  const creerDevoir = async () => {
    if (!contract || userRole !== "enseignant") return alert("Enseignant seulement");
    if (!newDevoir.moduleId || !newDevoir.titre || !newDevoir.description || !newDevoir.dateLimite) {
      return alert("Remplis tous les champs + sélectionne module");
    }

    const profPublicKey = (teacherPublicKeyOnChain || "").trim();
    if (!profPublicKey) {
      return alert("⚠️ Ta clé publique prof est vide.\nVa dans Profil → Générer & enregistrer (clé publique on-chain).");
    }

    // ✅ FIX: un prof ne peut créer que dans ses modules
    const moduleOk = modules.some(
      (m) => m.id === String(newDevoir.moduleId) && m.enseignant.toLowerCase() === account.toLowerCase()
    );
    if (!moduleOk) return alert("❌ Tu ne peux créer un devoir que dans tes propres modules.");

    try {
      const dateLimiteTimestamp = Math.floor(new Date(newDevoir.dateLimite).getTime() / 1000);
      if (Number.isNaN(dateLimiteTimestamp) || dateLimiteTimestamp <= Math.floor(Date.now() / 1000)) {
        return alert("Date limite doit être dans le futur");
      }

      let finalDescription = newDevoir.description;

      if (devoirFile) {
        const up = await uploadFileToServer(devoirFile);
        const hash = await sha256FileHex(devoirFile);
        const type = devoirFile.type || "application/octet-stream";
        const nom = devoirFile.name;

        finalDescription =
          `${newDevoir.description}` +
          `\n\n---\n📎 FichierDevoir:\n` +
          `Nom: ${nom}\n` +
          `Type: ${type}\n` +
          `Hash: ${hash}\n` +
          `URI: ${up.uri}\n`;
      }

      const tx = await contract.creerDevoir(
        Number(newDevoir.moduleId),
        newDevoir.titre,
        finalDescription,
        profPublicKey,
        dateLimiteTimestamp
      );
      await tx.wait();

      alert("✅ Devoir créé !\n\n🔓 Les étudiants chiffreront avec TA clé publique.\n🔐 Tu déchiffreras avec TA clé privée (Profil).");

      setNewDevoir({ moduleId: "", titre: "", description: "", dateLimite: "" });
      setDevoirFile(null);
      if (devoirFileRef.current) devoirFileRef.current.value = "";

      await loadDevoirs();
      await loadTeacherSubmissions();
    } catch (e) {
      console.error(e);
      alert("Erreur création devoir: " + getEthersError(e));
    }
  };

  // ======================= ÉTUDIANT: SOUMETTRE =======================
  const soumettreDevoir = async () => {
    if (!contract || userRole !== "etudiant") return alert("Étudiant seulement");
    const devoir = eligibleDevoirs.find((d) => d.id === newSoumission.devoirId);
    if (!devoir) return alert("Devoir introuvable (ou pas inscrit au module)");
    if (!newSoumission.identite || !newSoumission.reponse) return alert("Identité + réponse obligatoires");

    const pubKey = (devoir.clePublique || "").trim();
    if (!pubKey) return alert("⚠️ Clé publique du prof/devoir vide. Le prof doit définir sa clé publique (Profil).");

    try {
      const reponseChiffree = await CryptoUtils.rsaEncrypt(newSoumission.reponse, pubKey);
      const identiteChiffree = await CryptoUtils.rsaEncrypt(newSoumission.identite, pubKey);

      let fichierHash = "";
      let fichierNom = "";
      let fichierType = "";
      let fichierURI = "";
      let cleAESChiffree = "";

      if (selectedFile) {
        const aesKey = CryptoUtils.generateAESKey();
        const fileData = await CryptoUtils.encryptFileContentToString(selectedFile, aesKey);

        fichierHash = await sha256Hex(fileData.encryptedContent);
        fichierNom = fileData.name;
        fichierType = fileData.type;

        const encBlob = stringToBlob(fileData.encryptedContent);
        const up = await uploadFileToServer(encBlob, `enc_${Date.now()}_${fileData.name}.bin`);
        fichierURI = up.uri;

        cleAESChiffree = await CryptoUtils.rsaEncrypt(aesKey, pubKey);
      }

      // ✅ FIX IDENTITY ON-CHAIN: l’adresse de l’étudiant est msg.sender dans le smart contract
      const tx = await contract.soumettreDevoir(
        Number(newSoumission.devoirId),
        reponseChiffree,
        identiteChiffree,
        fichierHash,
        fichierNom,
        fichierType,
        fichierURI,
        cleAESChiffree
      );
      await tx.wait();

      alert("✅ Soumission envoyée !");
      setNewSoumission({ devoirId: "", identite: "", reponse: "" });
      setSelectedFile(null);

      await loadStudentSubmissions();
      await loadStudentGrades();
    } catch (e) {
      console.error(e);
      alert("Erreur soumission: " + getEthersError(e));
    }
  };

  // ======================= ENSEIGNANT: DÉCHIFFRER =======================
  const decrypterSoumission = async (soumissionId) => {
    setDecryptedFile(null);

    const sk = (teacherPrivateKey || "").trim();
    if (!sk) return alert("Colle ta clé privée RSA (celle du Profil)");
    const s = teacherSubmissions.find((x) => x.id === String(soumissionId));
    if (!s) return alert("Soumission introuvable");

    const devoir = devoirs.find((d) => d.id === String(s.devoirId));
    const devoirPubKey = (devoir?.clePublique || "").trim();
    if (!devoirPubKey) {
      return alert("⚠️ Clé publique du devoir introuvable/vide.\n➡️ Recharge les devoirs, ou vérifie la création du devoir.");
    }

    try {
      const ok = await testKeyPairWithDevoirPubKey(sk, devoirPubKey);
      if (!ok) {
        alert(
          "❌ Ta clé privée NE correspond PAS à la clé publique stockée dans ce devoir.\n\n" +
            "Ca arrive si :\n" +
            "- tu as régénéré tes clés après avoir créé le devoir\n" +
            "- ou le devoir a été créé avant de définir la clé publique prof\n\n" +
            "➡️ Solution sûre : Profil (garder la même clé privée) puis recréer le devoir et refaire une soumission."
        );
        return;
      }
    } catch (e) {
      console.error(e);
      alert(
        "❌ Test clé privée/clé publique impossible : " +
          getCryptoErrorText(e) +
          "\n\n➡️ Vérifie que tu as collé une clé privée PKCS8 base64 complète (sans espaces)."
      );
      return;
    }

    try {
      const contenu = await CryptoUtils.rsaDecrypt(s.contenuChiffre, sk);
      const identite = await CryptoUtils.rsaDecrypt(s.identiteChiffree, sk);

      let fileInfo = "";
      if (s.fichierURI && s.cleAESChiffree) {
        const aesKey = await CryptoUtils.rsaDecrypt(s.cleAESChiffree, sk);
        const encString = await fetchTextFromUri(s.fichierURI);
        const bytes = CryptoUtils.decryptAesStringToBytes(encString, aesKey);

        const blob = new Blob([bytes], { type: s.fichierType || "application/octet-stream" });
        setDecryptedFile({
          blob,
          name: s.fichierNom || "soumission.bin",
          type: s.fichierType || "application/octet-stream",
        });

        fileInfo =
          `\n\n📎 Fichier: ${s.fichierNom}\n` + `✅ Déchiffré: prêt à télécharger via le bouton ci-dessous.\n`;
      }

      // ✅ FIX: on affiche clairement l’adresse Ethereum de l’étudiant qui a soumis
      setDecryptedText(
        `👤 Identité (chiffrée → déchiffrée): ${identite}\n` +
          `🧾 Adresse Ethereum (ON-CHAIN): ${s.etudiant}\n\n` +
          `📄 Réponse:\n${contenu}${fileInfo}`
      );
    } catch (e) {
      console.error(e);
      alert(
        "Erreur déchiffrement: " +
          getCryptoErrorText(e) +
          "\n\n✅ Vérifie que:\n- tu utilises la clé privée du PROF (Profil)\n- la clé collée ne contient pas d'espaces/retours\n- le devoir a été créé APRÈS avoir défini la clé publique prof\n- tu n'as pas régénéré les clés après création du devoir"
      );
    }
  };

  // ======================= ENSEIGNANT: CORRIGER =======================
  const corrigerSoumission = async () => {
    if (!contract || userRole !== "enseignant") return alert("Enseignant seulement");
    if (!correction.soumissionId || correction.note === "") return alert("ID soumission + note obligatoires");

    // ✅ FIX: empêcher un prof de corriger une soumission qui n’est pas à lui
    const target = teacherSubmissions.find((s) => s.id === String(correction.soumissionId));
    if (!target) return alert("❌ Tu ne peux corriger que les soumissions de TES devoirs (charge tes soumissions).");

    try {
      let corrHash = "";
      let corrNom = "";
      let corrURI = "";

      const corrFile = correctionFileRef.current?.files?.[0];
      if (corrFile) {
        const aesKey = CryptoUtils.generateAESKey();
        const fileData = await CryptoUtils.encryptFileContentToString(corrFile, aesKey);

        corrHash = await sha256Hex(fileData.encryptedContent);
        corrNom = fileData.name;

        const encBlob = stringToBlob(fileData.encryptedContent);
        const up = await uploadFileToServer(encBlob, `corr_enc_${Date.now()}_${fileData.name}.bin`);
        corrURI = up.uri;
      }

      // ✅ FIX: la correction est liée à la SOUMISSION (donc à l’étudiant spécifique automatiquement)
      const tx = await contract.corrigerSoumission(
        Number(correction.soumissionId),
        Number(correction.note),
        correction.commentaire || "",
        corrHash,
        corrNom,
        corrURI
      );
      await tx.wait();

      alert(`✅ Correction enregistrée pour l’étudiant: ${target.etudiant}`);
      setCorrection({ soumissionId: "", note: "", commentaire: "" });
      if (correctionFileRef.current) correctionFileRef.current.value = "";

      await loadTeacherSubmissions();
      await loadStudentSubmissions();
      await loadStudentGrades();
    } catch (e) {
      console.error(e);
      alert("Erreur correction: " + getEthersError(e));
    }
  };

  // ======================= ÉTUDIANT: TÉLÉCHARGER CORRECTION =======================
  const telechargerFichierCorrection = async (uri, nom) => {
    if (!uri) return alert("Aucun fichier correction");
    try {
      await downloadFromUri(uri, nom || "correction.bin");
    } catch (e) {
      console.error(e);
      alert("Erreur téléchargement correction: " + getEthersError(e));
    }
  };

  // ======================= ENSEIGNANT: ANTI-PLAGIAT =======================
  const analyserPlagiat = async () => {
    const sk = (teacherPrivateKey || "").trim();
    if (!sk) return alert("Colle ta clé privée RSA (Profil)");
    if (!teacherSubmissions.length) return alert("Aucune soumission chargée");

    try {
      const textes = [];
      for (const s of teacherSubmissions) {
        try {
          const t = await CryptoUtils.rsaDecrypt(s.contenuChiffre, sk);
          textes.push(t);
        } catch {
          textes.push("");
        }
      }
      const results = AntiPlagiat.detecter(textes.filter(Boolean));
      setPlagiarismResults(results);
      if (!results.length) alert("✅ Aucun plagiat détecté (test simple).");
    } catch (e) {
      console.error(e);
      alert("Erreur analyse plagiat: " + getEthersError(e));
    }
  };

  // ======================= EFFECTS =======================
  useEffect(() => {
    if (!contract) return;
    loadModules();
    loadDevoirs();
  }, [contract, loadModules, loadDevoirs]);

  useEffect(() => {
    if (!contract || !account) return;

    // ✅ Clés: prof only
    if (userRole === "enseignant") {
      loadTeacherPublicKeyFromChain();
      loadTeacherPrivateKeyLocal();
    } else {
      setTeacherPublicKeyOnChain("");
      setTeacherPrivateKeyLocal("");
      setTeacherPrivateKey("");
      setShowMyPriv(false);
    }
  }, [contract, account, userRole, loadTeacherPublicKeyFromChain, loadTeacherPrivateKeyLocal]);

  useEffect(() => {
    loadEligibleDevoirsForStudent();
  }, [loadEligibleDevoirsForStudent]);

  useEffect(() => {
    loadStudentModuleIds();
  }, [loadStudentModuleIds]);

  useEffect(() => {
    if (!contract || !account) return;

    if (activeTab === "corriger" && userRole === "enseignant") loadTeacherSubmissions();
    if (activeTab === "antiplagiat" && userRole === "enseignant") loadTeacherSubmissions();
    if (activeTab === "soumettre" && userRole === "etudiant") loadStudentSubmissions();
    if (activeTab === "mes-notes" && userRole === "etudiant") {
      loadStudentGrades();
      loadStudentSubmissions();
    }
  }, [activeTab, userRole, contract, account, loadTeacherSubmissions, loadStudentSubmissions, loadStudentGrades]);

  // ======================= UI HELPERS =======================
  const shortAddr = (a) => (a ? `${a.substring(0, 6)}...${a.substring(a.length - 4)}` : "");

  // STUDENT: show teacher public key for chosen devoir (info)
  useEffect(() => {
    const run = async () => {
      if (!contract || userRole !== "etudiant" || !newSoumission.devoirId) {
        setSelectedDevoirTeacherPubKey("");
        return;
      }
      const d = eligibleDevoirs.find((x) => x.id === newSoumission.devoirId);
      if (!d) {
        setSelectedDevoirTeacherPubKey("");
        return;
      }
      try {
        const t = await contract.enseignants(d.enseignant);
        setSelectedDevoirTeacherPubKey(t.clePublique || "");
      } catch {
        setSelectedDevoirTeacherPubKey("");
      }
    };
    run();
  }, [contract, userRole, newSoumission.devoirId, eligibleDevoirs]);

  // ✅ FIX 1 & 2 : Filtrage devoirs selon le rôle (page Devoirs)
  const devoirsVisibles = useMemo(() => {
    if (!account) return [];
    if (userRole === "enseignant") {
      return devoirs.filter((d) => d.enseignant.toLowerCase() === account.toLowerCase());
    }
    if (userRole === "etudiant") {
      // on utilise studentModuleIds (plus rapide) si dispo, sinon eligibleDevoirs fallback
      if (studentModuleIds.length) return devoirs.filter((d) => studentModuleIds.includes(String(d.moduleId)));
      return eligibleDevoirs; // fallback
    }
    // admin / non-inscrit: afficher tout
    return devoirs;
  }, [devoirs, eligibleDevoirs, userRole, account, studentModuleIds]);

  // ✅ FIX 1 : modules visibles pour prof
  const modulesVisibles = useMemo(() => {
    if (!account) return [];
    if (userRole === "enseignant") return modules.filter((m) => m.enseignant.toLowerCase() === account.toLowerCase());
    return modules;
  }, [modules, userRole, account]);

  // ======================= RENDER =======================
  return (
    <div className="app-container">
      {/* HEADER */}
      <header className="header">
        <div className="container">
          <div className="header-content">
            <div>
              <h1 className="title">📚 Système de Gestion des Contrôles</h1>
              <p className="subtitle">Blockchain + RSA/AES + Upload + Anti-Plagiat</p>
            </div>

            {!account ? (
              <button onClick={connectWallet} className="btn-connect">
                🔗 Connecter Wallet
              </button>
            ) : (
              <div className="account-info">
                <div className="account-label">Connecté:</div>
                <div className="account-address">{shortAddr(account)}</div>
                <div className={`role-badge role-${userRole}`}>
                  {userRole === "admin"
                    ? "👑 Admin"
                    : userRole === "enseignant"
                    ? "👨‍🏫 Enseignant"
                    : userRole === "etudiant"
                    ? "👨‍🎓 Étudiant"
                    : "❓ Non inscrit"}
                </div>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* NAV */}
      {account && (
        <nav className="nav">
          <div className="container">
            <div className="nav-tabs">
              {[
                "home",
                "devoirs",
                userRole === "admin" && "admin",
                userRole === "admin" && "modules",
                userRole === "enseignant" && "creer",
                userRole === "enseignant" && "corriger",
                userRole === "enseignant" && "antiplagiat",
                userRole === "etudiant" && "soumettre",
                userRole === "etudiant" && "mes-notes",
                "profil",
              ]
                .filter(Boolean)
                .map((tab) => (
                  <button
                    key={tab}
                    onClick={() => setActiveTab(tab)}
                    className={`nav-button ${activeTab === tab ? "active" : ""}`}
                  >
                    {tab === "home" && "🏠 Accueil"}
                    {tab === "devoirs" && "📝 Devoirs"}
                    {tab === "admin" && "⚙️ Admin"}
                    {tab === "modules" && "📚 Modules"}
                    {tab === "creer" && "➕ Créer Devoir"}
                    {tab === "corriger" && "🧾 Corriger"}
                    {tab === "antiplagiat" && "🛡️ Anti-Plagiat"}
                    {tab === "soumettre" && "📤 Soumettre"}
                    {tab === "mes-notes" && "📈 Mes Notes"}
                    {tab === "profil" && "👤 Profil"}
                  </button>
                ))}
            </div>
          </div>
        </nav>
      )}

      {/* MAIN */}
      <main className="main-content">
        {!account ? (
          <div className="welcome-card card">
            <div className="welcome-icon">🔐</div>
            <h2 className="welcome-title">Bienvenue</h2>
            <p className="welcome-text">Connectez votre wallet Ethereum pour accéder au système.</p>
            <button onClick={connectWallet} className="btn-connect btn-large">
              Connecter MetaMask
            </button>
          </div>
        ) : (
          <>
            {/* HOME */}
            {activeTab === "home" && (
              <div className="dashboard">
                <div className="dashboard-stats card">
                  <h2 className="section-title">📊 Dashboard</h2>
                  <div className="stats-grid">
                    <div className="stat-card">
                      <div className="stat-number">{devoirsVisibles.length}</div>
                      <div className="stat-label">Devoirs visibles</div>
                    </div>
                    <div className="stat-card blue">
                      <div className="stat-number">{modulesVisibles.length}</div>
                      <div className="stat-label">Modules visibles</div>
                    </div>
                    <div className="stat-card success">
                      <div className="stat-icon">🔐</div>
                      <div className="stat-label">RSA 2048</div>
                    </div>
                    <div className="stat-card purple">
                      <div className="stat-icon">🛡️</div>
                      <div className="stat-label">Anti-Plagiat</div>
                    </div>
                  </div>
                </div>

                <div className="info-card card">
                  <h3 className="section-subtitle">ℹ️ Infos</h3>
                  <ul className="info-list">
                    <li>
                      <span className="check-icon">✓</span> Les devoirs utilisent la clé publique du PROF (Profil).
                    </li>
                    <li>
                      <span className="check-icon">✓</span> L’étudiant chiffre uniquement avec la clé publique du prof (pas de clés étudiant).
                    </li>
                    <li>
                      <span className="check-icon">✓</span> L’adresse Ethereum de l’étudiant (msg.sender) identifie chaque soumission.
                    </li>
                    <li>
                      <span className="check-icon">✓</span> Correction liée à la soumission → donc à l’étudiant spécifique.
                    </li>
                  </ul>
                </div>
              </div>
            )}

            {/* DEVOIRS (FILTRÉ ROLE) */}
            {activeTab === "devoirs" && (
              <div className="devoirs-list card">
                <h2 className="section-title">📝 Devoirs</h2>

                <div className="info-box" style={{ marginBottom: 12 }}>
                  {userRole === "enseignant" && (
                    <>
                      👨‍🏫 Vous voyez uniquement <b>vos devoirs</b> (enseignant = wallet connecté).
                    </>
                  )}
                  {userRole === "etudiant" && (
                    <>
                      👨‍🎓 Vous voyez uniquement les devoirs des <b>modules où vous êtes inscrit</b>.
                    </>
                  )}
                  {userRole === "admin" && <>👑 Admin : vous voyez tous les devoirs.</>}
                </div>

                {devoirsVisibles.length === 0 ? (
                  <p className="empty-state">Aucun devoir visible.</p>
                ) : (
                  <div className="devoirs-grid">
                    {devoirsVisibles.map((d) => {
                      const mod = modules.find((m) => m.id === d.moduleId);
                      return (
                        <div key={d.id} className="devoir-card card">
                          <div className="devoir-header">
                            <h3 className="devoir-title">{d.titre}</h3>
                            <span className="devoir-id">ID: {d.id}</span>
                          </div>

                          <p className="devoir-desc">{d.description}</p>

                          {d.attachment?.uri && (
                            <div className="info-box" style={{ marginTop: 10 }}>
                              <div style={{ opacity: 0.9 }}>
                                📎 Fichier devoir: <b>{d.attachment.nom || "devoir.pdf"}</b>
                              </div>
                              <div style={{ fontSize: 12, opacity: 0.8, marginTop: 4 }}>
                                Hash: {d.attachment.hash ? d.attachment.hash.slice(0, 16) + "..." : "—"}
                              </div>
                              <button
                                className="btn-info"
                                style={{ marginTop: 8 }}
                                onClick={async () => {
                                  try {
                                    await downloadFromUri(d.attachment.uri, d.attachment.nom || "devoir.bin");
                                  } catch (e) {
                                    alert("Erreur téléchargement fichier devoir: " + getEthersError(e));
                                  }
                                }}
                              >
                                ⬇️ Télécharger fichier devoir
                              </button>
                            </div>
                          )}

                          <div className="devoir-meta">
                            <div className="meta-item">
                              <span className="meta-label">📚 Module :</span>
                              <span>{mod ? `${mod.nom} (coeff ${mod.coefficient})` : d.moduleId}</span>
                            </div>
                            <div className="meta-item">
                              <span className="meta-label">📅 Création :</span>
                              <span>{d.dateCreation}</span>
                            </div>
                            <div className="meta-item">
                              <span className="meta-label">⏰ Date limite :</span>
                              <span>{d.dateLimite}</span>
                            </div>
                          </div>
                          <div className="devoir-teacher">Enseignant : {shortAddr(d.enseignant)}</div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* ADMIN */}
            {activeTab === "admin" && userRole === "admin" && (
              <div className="admin-panel card">
                <h2 className="section-title">⚙️ Admin</h2>

                <div className="admin-grid">
                  <div className="admin-form">
                    <h3 className="form-title">👨‍🏫 Inscrire enseignant</h3>
                    <div className="form-group">
                      <input
                        className="input-glass"
                        placeholder="Adresse Ethereum"
                        value={newTeacher.address}
                        onChange={(e) => setNewTeacher((t) => ({ ...t, address: e.target.value }))}
                      />
                      <input
                        className="input-glass"
                        placeholder="Nom enseignant"
                        value={newTeacher.nom}
                        onChange={(e) => setNewTeacher((t) => ({ ...t, nom: e.target.value }))}
                      />

                      <input
                        className="input-glass"
                        placeholder="Nom du module (ex: Réseaux)"
                        value={newTeacher.moduleNom}
                        onChange={(e) => setNewTeacher((t) => ({ ...t, moduleNom: e.target.value }))}
                      />
                      <input
                        className="input-glass"
                        type="number"
                        placeholder="Coefficient (ex: 3)"
                        value={newTeacher.coefficient}
                        onChange={(e) => setNewTeacher((t) => ({ ...t, coefficient: e.target.value }))}
                      />

                      <button className="btn-success" onClick={inscrireEnseignant}>
                        💾 Inscrire enseignant + module
                      </button>

                      <div className="warning-box">
                        ✅ Le prof définira sa clé publique dans <b>Profil</b>.
                      </div>
                    </div>
                  </div>

                  <div className="admin-form">
                    <h3 className="form-title">👨‍🎓 Inscrire étudiant</h3>
                    <div className="form-group">
                      <input
                        className="input-glass"
                        placeholder="Adresse Ethereum"
                        value={newStudent.address}
                        onChange={(e) => setNewStudent((s) => ({ ...s, address: e.target.value }))}
                      />
                      <input
                        className="input-glass"
                        placeholder="Nom étudiant"
                        value={newStudent.nom}
                        onChange={(e) => setNewStudent((s) => ({ ...s, nom: e.target.value }))}
                      />
                      <input
                        className="input-glass"
                        placeholder="Numéro étudiant"
                        value={newStudent.numero}
                        onChange={(e) => setNewStudent((s) => ({ ...s, numero: e.target.value }))}
                      />
                      <button className="btn-success" onClick={inscrireEtudiant}>
                        💾 Inscrire étudiant
                      </button>

                      <div className="warning-box">
                        ✅ Étudiant : pas de clés RSA à gérer dans cette version (chiffrement uniquement avec la clé publique du prof).
                      </div>
                    </div>
                  </div>
                </div>

                <div className="card" style={{ marginTop: 14 }}>
                  <h3 className="section-subtitle">📚 Affecter un étudiant à un module</h3>
                  <div className="form-group">
                    <label className="form-label">Module</label>
                    <select
                      className="input-glass select-large"
                      value={assign.moduleId}
                      onChange={(e) => setAssign((a) => ({ ...a, moduleId: e.target.value }))}
                    >
                      <option value="">-- Choisir --</option>
                      {modules.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.nom} (ID {m.id}) — {shortAddr(m.enseignant)}
                        </option>
                      ))}
                    </select>

                    <label className="form-label">Adresse étudiant</label>
                    <input
                      className="input-glass"
                      placeholder="0x..."
                      value={assign.studentAddress}
                      onChange={(e) => setAssign((a) => ({ ...a, studentAddress: e.target.value }))}
                    />

                    <button className="btn-primary" onClick={affecterEtudiant}>
                      ✅ Affecter
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* MODULES */}
            {activeTab === "modules" && userRole === "admin" && (
              <div className="card">
                <h2 className="section-title">📚 Modules</h2>
                <button className="btn-primary" onClick={loadModules}>
                  🔄 Rafraîchir
                </button>
                <div style={{ marginTop: 12 }}>
                  {modules.length === 0 ? (
                    <p className="empty-state">Aucun module trouvé.</p>
                  ) : (
                    <div className="modules-list">
                      {modules.map((m) => (
                        <div key={m.id} className="module-item">
                          📖 <b>{m.nom}</b> (ID {m.id}, coeff {m.coefficient}) — 👨‍🏫 {shortAddr(m.enseignant)}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* CREER */}
            {activeTab === "creer" && userRole === "enseignant" && (
              <div className="create-form card">
                <h2 className="section-title">➕ Créer devoir</h2>

                <div className="form-group large">
                  <label className="form-label">Module (uniquement tes modules)</label>
                  <select
                    className="input-glass select-large"
                    value={newDevoir.moduleId}
                    onChange={(e) => setNewDevoir((d) => ({ ...d, moduleId: e.target.value }))}
                  >
                    <option value="">-- Choisir un module --</option>
                    {modulesVisibles.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.nom} (ID {m.id})
                      </option>
                    ))}
                  </select>

                  <label className="form-label">Titre</label>
                  <input
                    className="input-glass"
                    value={newDevoir.titre}
                    onChange={(e) => setNewDevoir((d) => ({ ...d, titre: e.target.value }))}
                    placeholder="Ex: Contrôle Chapitre 1"
                  />

                  <label className="form-label">Description</label>
                  <textarea
                    className="input-glass textarea-large"
                    value={newDevoir.description}
                    onChange={(e) => setNewDevoir((d) => ({ ...d, description: e.target.value }))}
                    placeholder="Consignes..."
                  />

                  <label className="form-label">📎 Fichier devoir (optionnel)</label>
                  <input
                    ref={devoirFileRef}
                    className="file-input"
                    type="file"
                    accept=".pdf,.doc,.docx,.ppt,.pptx,.txt,.zip,image/*"
                    onChange={(e) => setDevoirFile(e.target.files?.[0] || null)}
                  />
                  {devoirFile && (
                    <div style={{ marginTop: 6, opacity: 0.9 }}>
                      📎 {devoirFile.name} ({(devoirFile.size / 1024).toFixed(1)} KB)
                    </div>
                  )}

                  <label className="form-label">Date limite</label>
                  <input
                    className="input-glass"
                    type="datetime-local"
                    value={newDevoir.dateLimite}
                    onChange={(e) => setNewDevoir((d) => ({ ...d, dateLimite: e.target.value }))}
                  />

                  <button className="btn-primary btn-large" onClick={creerDevoir}>
                    🔐 Créer (utilise clé publique PROF)
                  </button>

                  <div className="info-box">
                    ✅ Les étudiants chiffrent avec ta clé publique (Profil).
                    <br />
                    🔐 Tu déchiffres avec ta clé privée (Profil).
                    <br />
                    ❌ Pas de clés RSA côté étudiant dans cette version.
                  </div>
                </div>
              </div>
            )}

            {/* CORRIGER */}
            {activeTab === "corriger" && userRole === "enseignant" && (
              <div className="card">
                <h2 className="section-title">🧾 Corriger (uniquement tes devoirs)</h2>

                <button className="btn-primary" onClick={loadTeacherSubmissions}>
                  🔄 Charger mes soumissions
                </button>

                <div style={{ marginTop: 12 }} className="form-group">
                  <label className="form-label">🔑 Clé privée RSA (prof) — utiliser celle du Profil</label>
                  <input
                    className="input-glass input-private-key"
                    type="password"
                    placeholder="Collez votre clé privée RSA (base64 PKCS8)"
                    value={teacherPrivateKey}
                    onChange={(e) => setTeacherPrivateKey(e.target.value)}
                  />
                  <div style={{ display: "flex", gap: 10, marginTop: 8, flexWrap: "wrap" }}>
                    <button className="btn-info" onClick={() => copyToClipboard(teacherPrivateKey)} disabled={!teacherPrivateKey}>
                      📋 Copier
                    </button>
                    <button
                      className="btn-primary"
                      onClick={async () => {
                        const t = await pasteFromClipboard();
                        if (t) setTeacherPrivateKey(t);
                      }}
                    >
                      📥 Coller
                    </button>
                    <button className="btn-warning" onClick={() => setTeacherPrivateKey("")} disabled={!teacherPrivateKey}>
                      🧹 Vider
                    </button>

                    <button
                      className="btn-success"
                      onClick={() => {
                        if (!teacherPrivateKeyLocal) return alert("Ta clé privée locale est vide. Va dans Profil → Générer & enregistrer.");
                        setTeacherPrivateKey(teacherPrivateKeyLocal);
                        alert("✅ Clé privée (Profil) chargée automatiquement !");
                      }}
                    >
                      ⚡ Utiliser ma clé privée (Profil)
                    </button>
                  </div>
                </div>

                {teacherSubmissions.length === 0 ? (
                  <p className="empty-state">Aucune soumission.</p>
                ) : (
                  <div className="soumissions-grid">
                    {teacherSubmissions.map((s) => (
                      <div key={s.id} className="soumission-card">
                        <div className="soumission-header">
                          <div>
                            <h3 className="soumission-titre">{s.devoirTitre}</h3>
                            <div className="devoir-id">
                              Soumission #{s.id} — Devoir #{s.devoirId}
                            </div>
                          </div>
                          <span className={`soumission-status ${s.estCorrige ? "corrigee" : "en-attente"}`}>
                            {s.estCorrige ? "Corrigée" : "En attente"}
                          </span>
                        </div>

                        <div className="soumission-meta">
                          <div className="meta-item">
                            <span className="meta-label">👤 Étudiant (adresse):</span>
                            <span>{shortAddr(s.etudiant)}</span>
                          </div>
                          <div className="meta-item">
                            <span className="meta-label">📅 Soumise le:</span>
                            <span>{s.dateSubmission}</span>
                          </div>
                        </div>

                        <p className="devoir-desc">
                          <strong>Contenu chiffré:</strong> {String(s.contenuChiffre).slice(0, 80)}...
                        </p>

                        {s.fichierURI && (
                          <p className="devoir-desc">
                            <strong>📎 Fichier chiffré:</strong> {s.fichierNom} —{" "}
                            <span style={{ opacity: 0.8 }}>{s.fichierURI}</span>
                          </p>
                        )}

                        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                          <button className="btn-info" onClick={() => decrypterSoumission(s.id)}>
                            🔓 Déchiffrer
                          </button>

                          {/* ✅ FIX 4: lien correction -> soumission -> étudiant spécifique */}
                          <button
                            className="btn-success"
                            onClick={() => {
                              setCorrection((c) => ({ ...c, soumissionId: s.id }));
                              setActiveTab("corriger");
                              alert(`✅ ID soumission pré-rempli: ${s.id}\nÉtudiant: ${s.etudiant}`);
                            }}
                          >
                            ✍️ Corriger cette soumission
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Après déchiffrement */}
                {decryptedText && (
                  <div className="decrypted-content">
                    <h3>📄 Contenu déchiffré</h3>
                    <pre style={{ whiteSpace: "pre-wrap" }}>{decryptedText}</pre>

                    {decryptedFile?.blob && (
                      <div style={{ marginTop: 10, display: "flex", gap: 10, flexWrap: "wrap" }}>
                        <button className="btn-success" onClick={() => downloadBlob(decryptedFile.blob, decryptedFile.name)}>
                          ⬇️ Télécharger fichier déchiffré
                        </button>
                        <div style={{ opacity: 0.85, alignSelf: "center" }}>📎 {decryptedFile.name}</div>
                      </div>
                    )}
                  </div>
                )}

                <div className="correction-form">
                  <h3 className="section-subtitle">✏️ Enregistrer correction (liée à la soumission)</h3>

                  <div className="form-group">
                    <div>
                      <label className="form-label">ID soumission</label>
                      <input
                        className="input-glass input-note"
                        type="number"
                        value={correction.soumissionId}
                        onChange={(e) => setCorrection((c) => ({ ...c, soumissionId: e.target.value }))}
                        placeholder="Ex: 1"
                      />
                    </div>

                    <div>
                      <label className="form-label">Note (/20)</label>
                      <input
                        className="input-glass input-note"
                        type="number"
                        value={correction.note}
                        onChange={(e) => setCorrection((c) => ({ ...c, note: e.target.value }))}
                        placeholder="Ex: 16"
                      />
                    </div>

                    <div>
                      <label className="form-label">Commentaire</label>
                      <textarea
                        className="input-glass textarea-note"
                        value={correction.commentaire}
                        onChange={(e) => setCorrection((c) => ({ ...c, commentaire: e.target.value }))}
                        placeholder="Commentaires..."
                      />
                    </div>

                    <div>
                      <label className="form-label">📎 Fichier de correction (optionnel)</label>
                      <input ref={correctionFileRef} type="file" className="file-input" />
                      <div style={{ opacity: 0.8, marginTop: 6 }}>
                        (Actuellement: upload + chiffrement AES, mais la clé AES n’est pas envoyée à l’étudiant)
                      </div>
                    </div>

                    <button className="btn-primary btn-small" onClick={corrigerSoumission}>
                      ✅ Valider correction
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* ANTI-PLAGIAT */}
            {activeTab === "antiplagiat" && userRole === "enseignant" && (
              <div className="antiplagiat-panel card">
                <h2 className="section-title">🛡️ Anti-Plagiat (uniquement tes soumissions)</h2>

                <button className="btn-primary" onClick={loadTeacherSubmissions}>
                  🔄 Charger mes soumissions
                </button>

                <div className="form-group" style={{ marginTop: 12 }}>
                  <label className="form-label">🔑 Clé privée RSA (prof)</label>
                  <input
                    className="input-glass input-private-key"
                    type="password"
                    placeholder="Collez votre clé privée RSA"
                    value={teacherPrivateKey}
                    onChange={(e) => setTeacherPrivateKey(e.target.value)}
                  />
                  <div style={{ display: "flex", gap: 10, marginTop: 8, flexWrap: "wrap" }}>
                    <button className="btn-success" onClick={() => setTeacherPrivateKey(teacherPrivateKeyLocal)} disabled={!teacherPrivateKeyLocal}>
                      ⚡ Utiliser ma clé privée (Profil)
                    </button>
                    <button className="btn-warning" onClick={() => setTeacherPrivateKey("")} disabled={!teacherPrivateKey}>
                      🧹 Vider
                    </button>
                  </div>
                </div>

                <button className="btn-warning" onClick={analyserPlagiat}>
                  🚨 Analyser plagiat
                </button>

                <div style={{ marginTop: 12 }}>
                  <div className="soumission-selector" style={{ display: "flex", gap: 10 }}>
                    <input
                      className="input-glass input-small"
                      type="number"
                      placeholder="ID soumission à déchiffrer"
                      value={decryptId}
                      onChange={(e) => setDecryptId(e.target.value)}
                    />
                    <button className="btn-info" onClick={() => decrypterSoumission(decryptId)}>
                      🔓 Déchiffrer
                    </button>
                  </div>
                </div>

                {plagiarismResults.length > 0 && (
                  <div className="plagiarism-results">
                    <h3>⚠️ Détections</h3>
                    {plagiarismResults.map((r, i) => (
                      <div key={i} className="plagiarism-alert">
                        🚨 Similarité <strong>{r.score}%</strong> entre soumissions #{r.paire[0]} et #{r.paire[1]}
                      </div>
                    ))}
                  </div>
                )}

                {decryptedText && (
                  <div className="decrypted-content">
                    <h3>📄 Contenu déchiffré</h3>
                    <pre style={{ whiteSpace: "pre-wrap" }}>{decryptedText}</pre>

                    {decryptedFile?.blob && (
                      <div style={{ marginTop: 10, display: "flex", gap: 10, flexWrap: "wrap" }}>
                        <button className="btn-success" onClick={() => downloadBlob(decryptedFile.blob, decryptedFile.name)}>
                          ⬇️ Télécharger fichier déchiffré
                        </button>
                        <div style={{ opacity: 0.85, alignSelf: "center" }}>📎 {decryptedFile.name}</div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* SOUMETTRE */}
            {activeTab === "soumettre" && userRole === "etudiant" && (
              <div className="submit-form card">
                <h2 className="section-title">📤 Soumettre (texte + fichier)</h2>

                <div className="form-group large">
                  <label className="form-label">Devoir (uniquement modules où tu es inscrit)</label>
                  <select
                    className="input-glass select-large"
                    value={newSoumission.devoirId}
                    onChange={(e) => setNewSoumission((s) => ({ ...s, devoirId: e.target.value }))}
                  >
                    <option value="">-- Choisir --</option>
                    {eligibleDevoirs.map((d) => {
                      const mod = modules.find((m) => m.id === d.moduleId);
                      return (
                        <option key={d.id} value={d.id}>
                          {d.titre} — {mod ? mod.nom : `Module ${d.moduleId}`}
                        </option>
                      );
                    })}
                  </select>

                  {eligibleDevoirs.length === 0 && (
                    <div className="warning-box" style={{ marginTop: 10 }}>
                      ⚠️ Aucun devoir disponible pour toi.
                      <br />
                      👉 Demande à l’admin de t’affecter à un module.
                    </div>
                  )}

                  {newSoumission.devoirId && (
                    <div className="info-box" style={{ marginTop: 10 }}>
                      🔓 Clé publique du prof (info) :
                      <div style={{ marginTop: 6, fontSize: 12, opacity: 0.85, wordBreak: "break-all" }}>
                        {selectedDevoirTeacherPubKey ? selectedDevoirTeacherPubKey.slice(0, 80) + "..." : "Non définie"}
                      </div>
                      {selectedDevoirTeacherPubKey && (
                        <button className="btn-info" style={{ marginTop: 8 }} onClick={() => copyToClipboard(selectedDevoirTeacherPubKey)}>
                          📋 Copier clé publique prof
                        </button>
                      )}
                    </div>
                  )}

                  {(() => {
                    const d = eligibleDevoirs.find((x) => x.id === newSoumission.devoirId);
                    if (!d?.attachment?.uri) return null;
                    return (
                      <div className="info-box" style={{ marginTop: 10 }}>
                        📎 Fichier du devoir disponible: <b>{d.attachment.nom || "devoir.pdf"}</b>
                        <div style={{ marginTop: 8 }}>
                          <button
                            className="btn-info"
                            onClick={async () => {
                              try {
                                await downloadFromUri(d.attachment.uri, d.attachment.nom || "devoir.bin");
                              } catch (e) {
                                alert("Erreur téléchargement fichier devoir: " + getEthersError(e));
                              }
                            }}
                          >
                            ⬇️ Télécharger fichier devoir
                          </button>
                        </div>
                      </div>
                    );
                  })()}

                  <label className="form-label">Identité</label>
                  <input
                    className="input-glass"
                    value={newSoumission.identite}
                    onChange={(e) => setNewSoumission((s) => ({ ...s, identite: e.target.value }))}
                    placeholder="Nom Prénom"
                  />

                  <label className="form-label">📎 Fichier (optionnel)</label>
                  <input
                    className="file-input"
                    type="file"
                    accept=".pdf,.doc,.docx,.txt,.zip,image/*"
                    onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
                  />
                  {selectedFile && (
                    <div style={{ marginTop: 6 }}>
                      📎 {selectedFile.name} ({(selectedFile.size / 1024).toFixed(1)} KB)
                    </div>
                  )}

                  <label className="form-label">Réponse</label>
                  <textarea
                    className="input-glass textarea-xlarge"
                    value={newSoumission.reponse}
                    onChange={(e) => setNewSoumission((s) => ({ ...s, reponse: e.target.value }))}
                    placeholder="Votre réponse..."
                  />

                  <button className="btn-success btn-large" onClick={soumettreDevoir} disabled={!eligibleDevoirs.length}>
                    🔒 Soumettre (RSA + AES + Upload)
                  </button>

                  <div className="info-box">
                    ✅ Le texte est chiffré RSA avec la clé publique du prof (stockée dans le devoir).
                    <br />
                    📎 Le fichier est chiffré AES puis uploadé, et la clé AES est chiffrée RSA.
                    <br />
                    ✅ L’adresse Ethereum de l’étudiant (wallet) identifie la soumission.
                  </div>
                </div>
              </div>
            )}

            {/* MES NOTES */}
            {activeTab === "mes-notes" && userRole === "etudiant" && (
              <div className="grades-card card">
                <h2 className="section-title">📈 Mes notes & moyenne pondérée</h2>

                <div className="moyenne-finale">
                  <div className="moyenne-value">{calculerMoyennePonderee()}/20</div>
                  <div className="moyenne-label">Moyenne pondérée</div>
                </div>

                <h3 style={{ marginTop: 16 }}>📚 Notes</h3>
                <div className="grades-grid">
                  {studentGrades.length === 0 ? (
                    <p className="empty-state">Aucune note.</p>
                  ) : (
                    studentGrades.map((g) => {
                      const mod = modules.find((m) => m.id === g.moduleId);
                      return (
                        <div key={g.soumissionId} className="grade-card">
                          <div className="grade-module">{mod ? mod.nom : `Module ${g.moduleId}`}</div>
                          <div className="grade-note">{g.note}/20</div>
                          <div className="grade-coeff">×{mod ? mod.coefficient : "?"}</div>
                        </div>
                      );
                    })
                  )}
                </div>

                <h3 style={{ marginTop: 16 }}>🧾 Mes soumissions</h3>
                <div className="soumissions-grid">
                  {studentSubmissions.length === 0 ? (
                    <p className="empty-state">Aucune soumission.</p>
                  ) : (
                    studentSubmissions.map((s) => (
                      <div key={s.id} className="soumission-card">
                        <div className="soumission-header">
                          <div>
                            <h3 className="soumission-titre">{s.devoirTitre}</h3>
                            <div className="devoir-id">Soumission #{s.id}</div>
                          </div>
                          <span className={`soumission-status ${s.estCorrige ? "corrigee" : "en-attente"}`}>
                            {s.estCorrige ? "Corrigée" : "En attente"}
                          </span>
                        </div>

                        <div className="soumission-meta">
                          <div className="meta-item">
                            <span className="meta-label">📅 Soumise le:</span>
                            <span>{s.dateSubmission}</span>
                          </div>
                          <div className="meta-item">
                            <span className="meta-label">⏰ Date limite:</span>
                            <span>{s.dateLimite}</span>
                          </div>
                        </div>

                        {s.fichierURI && (
                          <div className="devoir-desc">
                            <strong>📎 Fichier:</strong> {s.fichierNom} <span style={{ opacity: 0.8 }}>(URI stockée)</span>
                          </div>
                        )}

                        {s.estCorrige && (
                          <div className="note-result" style={{ marginTop: 10 }}>
                            <div className="note-finale">{s.note}/20</div>
                            {s.commentaire && <div className="commentaire">{s.commentaire}</div>}

                            {s.fichierCorrectionURI ? (
                              <div style={{ marginTop: 10 }}>
                                <div style={{ opacity: 0.9 }}>
                                  📎 Correction: <b>{s.fichierCorrectionNom || "correction.bin"}</b>
                                </div>
                                <button
                                  className="btn-info"
                                  style={{ marginTop: 6 }}
                                  onClick={() => telechargerFichierCorrection(s.fichierCorrectionURI, s.fichierCorrectionNom)}
                                >
                                  ⬇️ Télécharger correction
                                </button>
                              </div>
                            ) : null}
                          </div>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}

            {/* PROFIL */}
            {activeTab === "profil" && (
              <div className="profile-card card">
                <h2 className="section-title">👤 Profil</h2>
                <div className="profile-grid">
                  <div className="profile-item">
                    <div className="profile-label">Adresse</div>
                    <div className="profile-value">{account}</div>
                  </div>
                  <div className="profile-item">
                    <div className="profile-label">Rôle</div>
                    <div className="profile-value role-large">{userRole}</div>
                  </div>
                  <div className="profile-item">
                    <div className="profile-label">Upload Server</div>
                    <div className="profile-value">{FILE_API_URL}</div>
                  </div>
                </div>

                {/* ✅ PROF ONLY */}
                {userRole === "enseignant" ? (
                  <div className="card" style={{ marginTop: 14 }}>
                    <h3 className="section-subtitle">🔑 Mes clés RSA (PROF)</h3>

                    <div className="info-box">
                      🔓 Clé publique sur-chain
                      <br />
                      🔐 Clé privée locale (navigateur)
                      <br />
                      ✅ Modules visibles: uniquement tes modules
                    </div>

                    {/* ✅ FIX 1 : afficher uniquement les modules du prof dans profil */}
                    <div className="card" style={{ marginTop: 12 }}>
                      <h4 className="section-subtitle">📚 Mes modules</h4>
                      {modulesVisibles.length === 0 ? (
                        <p className="empty-state">Aucun module assigné.</p>
                      ) : (
                        <div className="modules-list">
                          {modulesVisibles.map((m) => (
                            <div key={m.id} className="module-item">
                              📖 <b>{m.nom}</b> (ID {m.id}, coeff {m.coefficient})
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* ✅ FIX 1 : afficher uniquement les devoirs du prof dans profil */}
                    <div className="card" style={{ marginTop: 12 }}>
                      <h4 className="section-subtitle">📝 Mes devoirs</h4>
                      {devoirsVisibles.length === 0 ? (
                        <p className="empty-state">Aucun devoir créé.</p>
                      ) : (
                        <div className="modules-list">
                          {devoirsVisibles.map((d) => (
                            <div key={d.id} className="module-item">
                              📝 <b>{d.titre}</b> (Devoir ID {d.id}) — Module {d.moduleId}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    <div style={{ marginTop: 10 }}>
                      <div style={{ opacity: 0.9, marginBottom: 6 }}>
                        <b>Clé publique on-chain :</b>
                      </div>
                      <textarea
                        className="input-glass textarea-large"
                        readOnly
                        value={teacherPublicKeyOnChain || ""}
                        placeholder="(vide) → clique sur “Générer & enregistrer”"
                      />
                      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 8 }}>
                        <button className="btn-info" onClick={() => copyToClipboard(teacherPublicKeyOnChain)} disabled={!teacherPublicKeyOnChain}>
                          📋 Copier clé publique
                        </button>
                        <button className="btn-primary" onClick={pushPublicKeyOnly}>
                          ✅ Vérifier clé publique
                        </button>
                      </div>
                    </div>

                    <div style={{ marginTop: 14 }}>
                      <div style={{ opacity: 0.9, marginBottom: 6 }}>
                        <b>Clé privée (locale) :</b>
                      </div>
                      <textarea
                        className="input-glass textarea-large"
                        readOnly
                        value={showMyPriv ? teacherPrivateKeyLocal || "" : teacherPrivateKeyLocal ? "•••••••••• (masquée)" : ""}
                        placeholder="(vide) → clique sur “Générer & enregistrer”"
                      />
                      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 8 }}>
                        <button className="btn-info" onClick={() => copyToClipboard(teacherPrivateKeyLocal)} disabled={!teacherPrivateKeyLocal}>
                          📋 Copier clé privée
                        </button>
                        <button className="btn-warning" onClick={() => setShowMyPriv((v) => !v)}>
                          {showMyPriv ? "🙈 Masquer" : "👁️ Afficher"}
                        </button>
                        <button
                          className="btn-success"
                          onClick={() => {
                            saveTeacherPrivateKeyLocal("");
                            setShowMyPriv(false);
                          }}
                          disabled={!teacherPrivateKeyLocal}
                        >
                          🧹 Effacer locale
                        </button>
                      </div>
                    </div>

                    <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 14 }}>
                      <button className="btn-primary btn-large" onClick={generateAndRegisterTeacherKeys}>
                        🔑 Générer & enregistrer
                      </button>
                      <button
                        className="btn-info"
                        onClick={async () => {
                          const t = await pasteFromClipboard();
                          if (t) {
                            saveTeacherPrivateKeyLocal(t);
                            alert("✅ Clé privée collée et sauvegardée localement.");
                          }
                        }}
                      >
                        📥 Coller ma clé privée (sauver local)
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="warning-box" style={{ marginTop: 14 }}>
                    ℹ️ Dans cette version, la gestion des clés RSA
                         est <b>uniquement pour l’enseignant</b>.
                    <br />
                    ✅ L’étudiant n’a pas besoin de clé privée/publique pour soumettre.
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </main>

      <footer className="footer">
        <div className="container">
          <p>© 2025 ENSA Tétouan — Système de Gestion des Contrôles Blockchain</p>
        </div>
      </footer>
    </div>
  );
}
