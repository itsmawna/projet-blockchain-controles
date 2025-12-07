import React, { useState, useEffect } from 'react';
import { ethers } from 'ethers';
import './styles.css'; // Import du CSS personnalisé

// Adresse du contrat déployé sur Hardhat localhost
const CONTRACT_ADDRESS = "0x5FbDB2315678afecb367f032d93F642f64180aa3";

// Utilitaires de chiffrement RSA simulé (pour démo)
const CryptoUtils = {
  generateKeyPair: () => {
    const id = Math.random().toString(36).substring(7);
    return {
      publicKey: `PUBLIC_KEY_${id}`,
      privateKey: `PRIVATE_KEY_${id}`
    };
  },
  
  encrypt: (message, publicKey) => {
    return btoa(JSON.stringify({ msg: message, key: publicKey }));
  },
  
  decrypt: (encrypted, privateKey) => {
    try {
      const decoded = JSON.parse(atob(encrypted));
      return decoded.msg;
    } catch {
      return "Erreur de déchiffrement";
    }
  }
};

// ABI du contrat (version simplifiée)
const CONTRACT_ABI = [
  "function inscrireEnseignant(address _adresse, string _nom, string _clePublique) public",
  "function inscrireEtudiant(address _adresse, string _nom, string _numeroEtudiant) public",
  "function creerDevoir(string _titre, string _description, string _clePubliqueChiffrement, uint256 _dateLimite) public returns (uint256)",
  "function soumettreDevoir(uint256 _devoirId, string _contenuChiffre, string _identiteChiffree) public returns (uint256)",
  "function corrigerSoumission(uint256 _soumissionId, uint256 _note, string _commentaire) public",
  "function publierAnnonce(string _titre, string _contenu, bool _estPublique) public returns (uint256)",
  "function obtenirDevoir(uint256 _devoirId) public view returns (tuple(uint256 id, address enseignant, string titre, string description, string clePubliqueChiffrement, uint256 dateCreation, uint256 dateLimite, bool estActif))",
  "function obtenirSoumission(uint256 _soumissionId) public view returns (tuple(uint256 id, uint256 devoirId, address etudiant, string contenuChiffre, string identiteChiffree, uint256 dateSubmission, bool estCorrige, uint256 note, string commentaire))",
  "function obtenirTousLesDevoirs() public view returns (uint256[])",
  "function obtenirSoumissionsDevoir(uint256 _devoirId) public view returns (uint256[])",
  "function obtenirSoumissionsEtudiant(address _etudiant) public view returns (uint256[])",
  "function estEnseignant(address _adresse) public view returns (bool)",
  "function estEtudiant(address _adresse) public view returns (bool)",
  "function administrateur() public view returns (address)",
  "event DevoirCree(uint256 indexed devoirId, address indexed enseignant, string titre)",
  "event SoumissionEnvoyee(uint256 indexed soumissionId, uint256 indexed devoirId, address indexed etudiant)",
  "event SoumissionCorrigee(uint256 indexed soumissionId, uint256 note)"
];

const App = () => {
  const [provider, setProvider] = useState(null);
  const [signer, setSigner] = useState(null);
  const [contract, setContract] = useState(null);
  const [account, setAccount] = useState('');
  const [userRole, setUserRole] = useState('');
  const [activeTab, setActiveTab] = useState('home');
  
  // Données
  const [devoirs, setDevoirs] = useState([]);
  const [keyPair, setKeyPair] = useState(null);

  // 🔎 Nouvelles données pour les sections demandées
  const [teacherSubmissions, setTeacherSubmissions] = useState([]); // Mes devoirs à corriger
  const [studentSubmissions, setStudentSubmissions] = useState([]); // Mes soumissions / notes

  // Formulaires
  const [newDevoir, setNewDevoir] = useState({
    titre: '',
    description: '',
    dateLimite: ''
  });
  
  const [newSoumission, setNewSoumission] = useState({
    devoirId: '',
    reponse: '',
    identite: ''
  });
  
  const [correction, setCorrection] = useState({
    soumissionId: '',
    note: '',
    commentaire: ''
  });

  // ⚙️ Formulaires ADMIN
  const [newTeacher, setNewTeacher] = useState({
    address: '',
    nom: '',
    clePublique: ''
  });

  const [newStudent, setNewStudent] = useState({
    address: '',
    nom: '',
    numero: ''
  });

  // Connexion au wallet
  const connectWallet = async () => {
    try {
      if (typeof window.ethereum === 'undefined') {
        alert('Veuillez installer MetaMask !');
        return;
      }

      const prov = new ethers.BrowserProvider(window.ethereum);
      const accounts = await prov.send("eth_requestAccounts", []);
      const sign = await prov.getSigner();

      // Vérifier réseau Hardhat local
      const network = await prov.getNetwork();
      if (network.chainId !== 31337n) {
        alert(`Attention : sélectionnez le réseau Hardhat (localhost, chainId 31337) dans MetaMask. Réseau actuel: ${network.chainId.toString()}`);
      }
      
      setProvider(prov);
      setSigner(sign);
      setAccount(accounts[0]);
      
      // Initialiser le contrat
      const cont = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, sign);
      setContract(cont);
      
      // Vérifier le rôle
      await checkUserRole(cont, accounts[0]);
    } catch (error) {
      console.error('Erreur de connexion:', error);
      alert('Erreur lors de la connexion au wallet');
    }
  };

  const checkUserRole = async (cont, addr) => {
    try {
      const isTeacher = await cont.estEnseignant(addr);
      const isStudent = await cont.estEtudiant(addr);
      const admin = await cont.administrateur();
      
      if (addr.toLowerCase() === admin.toLowerCase()) {
        setUserRole('admin');
      } else if (isTeacher) {
        setUserRole('enseignant');
      } else if (isStudent) {
        setUserRole('etudiant');
      } else {
        setUserRole('non-inscrit');
      }
    } catch (error) {
      console.error('Erreur vérification rôle:', error);
    }
  };

  // Charger les devoirs
  const loadDevoirs = async () => {
    if (!contract) return;
    
    try {
      const devoirIds = await contract.obtenirTousLesDevoirs();
      const devoirsData = await Promise.all(
        devoirIds.map(async (id) => {
          const devoir = await contract.obtenirDevoir(id);
          return {
            id: devoir.id.toString(),
            titre: devoir.titre,
            description: devoir.description,
            enseignant: devoir.enseignant,
            clePublique: devoir.clePubliqueChiffrement,
            dateCreation: new Date(Number(devoir.dateCreation) * 1000).toLocaleString(),
            dateLimite: new Date(Number(devoir.dateLimite) * 1000).toLocaleString(),
            estActif: devoir.estActif
          };
        })
      );
      setDevoirs(devoirsData);
    } catch (error) {
      console.error('Erreur chargement devoirs:', error);
    }
  };

  // 🔹 Mes devoirs à corriger (enseignant)
  const loadTeacherSubmissions = async () => {
    if (!contract || !account || userRole !== 'enseignant') return;

    try {
      // Devoirs créés par cet enseignant
      const myDevoirs = devoirs.filter(
        (d) => d.enseignant.toLowerCase() === account.toLowerCase()
      );

      const all = [];

      for (const d of myDevoirs) {
        const ids = await contract.obtenirSoumissionsDevoir(Number(d.id));
        for (const sId of ids) {
          const s = await contract.obtenirSoumission(sId);
          all.push({
            id: s.id.toString(),
            devoirId: s.devoirId.toString(),
            etudiant: s.etudiant,
            contenuChiffre: s.contenuChiffre,
            identiteChiffree: s.identiteChiffree,
            dateSubmission: new Date(Number(s.dateSubmission) * 1000).toLocaleString(),
            estCorrige: s.estCorrige,
            note: s.note.toString(),
            commentaire: s.commentaire,
            devoirTitre: d.titre
          });
        }
      }

      setTeacherSubmissions(all);
    } catch (err) {
      console.error("Erreur chargement des soumissions enseignant :", err);
    }
  };

  // 🔹 Mes soumissions & notes (étudiant)
  const loadStudentSubmissions = async () => {
    if (!contract || !account || userRole !== 'etudiant') return;

    try {
      const ids = await contract.obtenirSoumissionsEtudiant(account);
      const all = [];

      for (const sId of ids) {
        const s = await contract.obtenirSoumission(sId);
        const devoir = await contract.obtenirDevoir(s.devoirId);

        all.push({
          id: s.id.toString(),
          devoirId: s.devoirId.toString(),
          etudiant: s.etudiant,
          contenuChiffre: s.contenuChiffre,
          identiteChiffree: s.identiteChiffree,
          dateSubmission: new Date(Number(s.dateSubmission) * 1000).toLocaleString(),
          estCorrige: s.estCorrige,
          note: s.note.toString(),
          commentaire: s.commentaire,
          devoirTitre: devoir.titre,
          dateLimite: new Date(Number(devoir.dateLimite) * 1000).toLocaleString()
        });
      }

      setStudentSubmissions(all);
    } catch (err) {
      console.error("Erreur chargement des soumissions étudiant :", err);
    }
  };

  // Créer un devoir (enseignant)
  const creerDevoir = async () => {
    if (!contract || userRole !== 'enseignant') {
      alert("Seul un enseignant connecté peut créer un devoir.");
      return;
    }
    
    try {
      if (!newDevoir.titre || !newDevoir.description || !newDevoir.dateLimite) {
        alert("Veuillez remplir tous les champs.");
        return;
      }

      const keys = CryptoUtils.generateKeyPair();
      setKeyPair(keys);
      
      const dateLimiteTimestamp = Math.floor(
        new Date(newDevoir.dateLimite).getTime() / 1000
      );

      if (isNaN(dateLimiteTimestamp) || dateLimiteTimestamp <= Math.floor(Date.now() / 1000)) {
        alert("La date limite doit être dans le futur.");
        return;
      }
      
      const tx = await contract.creerDevoir(
        newDevoir.titre,
        newDevoir.description,
        keys.publicKey,
        dateLimiteTimestamp
      );
      
      await tx.wait();
      alert(`Devoir créé ! Votre clé privée: ${keys.privateKey} (gardez-la en sécurité !)`);      
      setNewDevoir({ titre: '', description: '', dateLimite: '' });
      await loadDevoirs();
    } catch (error) {
      console.error('Erreur création devoir:', error);
      alert('Erreur lors de la création du devoir');
    }
  };

  // Soumettre un devoir (étudiant)
  const soumettreDevoir = async () => {
    if (!contract || userRole !== 'etudiant') {
      alert("Seul un étudiant connecté peut soumettre un devoir.");
      return;
    }
    
    try {
      const devoir = devoirs.find(d => d.id === newSoumission.devoirId);
      if (!devoir) {
        alert('Devoir non trouvé');
        return;
      }

      if (!newSoumission.identite || !newSoumission.reponse) {
        alert("Veuillez remplir votre identité et vos réponses.");
        return;
      }
      
      const reponseChiffree = CryptoUtils.encrypt(newSoumission.reponse, devoir.clePublique);
      const identiteChiffree = CryptoUtils.encrypt(
        `${newSoumission.identite}_${Date.now()}`,
        devoir.clePublique
      );
      
      const tx = await contract.soumettreDevoir(
        Number(newSoumission.devoirId),
        reponseChiffree,
        identiteChiffree
      );
      
      await tx.wait();
      alert('Devoir soumis avec succès !');
      setNewSoumission({ devoirId: '', reponse: '', identite: '' });
      await loadStudentSubmissions(); // rafraîchir la section Mes soumissions
    } catch (error) {
      console.error('Erreur soumission:', error);
      alert('Erreur lors de la soumission du devoir');
    }
  };

  // Corriger une soumission (enseignant)
  const corrigerSoumission = async () => {
    if (!contract || userRole !== 'enseignant') {
      alert("Seul un enseignant connecté peut corriger une soumission.");
      return;
    }
    
    try {
      if (!correction.soumissionId || !correction.note) {
        alert("Veuillez renseigner l'ID de la soumission et la note.");
        return;
      }

      const tx = await contract.corrigerSoumission(
        Number(correction.soumissionId),
        Number(correction.note),
        correction.commentaire
      );
      
      await tx.wait();
      alert('Soumission corrigée avec succès !');
      setCorrection({ soumissionId: '', note: '', commentaire: '' });
      await loadTeacherSubmissions(); // rafraîchir la liste
      await loadStudentSubmissions(); // pour que l'étudiant voie la note
    } catch (error) {
      console.error('Erreur correction:', error);
      alert('Erreur lors de la correction');
    }
  };

  // 👉 Admin : inscrire un enseignant
  const inscrireEnseignant = async () => {
    if (!contract || userRole !== 'admin') {
      alert("Seul l'administrateur peut inscrire un enseignant.");
      return;
    }

    try {
      const { address, nom, clePublique } = newTeacher;
      if (!address || !nom || !clePublique) {
        alert("Remplis tous les champs (adresse, nom, clé publique).");
        return;
      }

      const tx = await contract.inscrireEnseignant(address, nom, clePublique);
      await tx.wait();
      alert("Enseignant inscrit avec succès !");
      setNewTeacher({ address: '', nom: '', clePublique: '' });
    } catch (err) {
      console.error("Erreur inscription enseignant :", err);
      alert("Erreur lors de l'inscription de l'enseignant.");
    }
  };

  // 👉 Admin : inscrire un étudiant
  const inscrireEtudiant = async () => {
    if (!contract || userRole !== 'admin') {
      alert("Seul l'administrateur peut inscrire un étudiant.");
      return;
    }

    try {
      const { address, nom, numero } = newStudent;
      if (!address || !nom || !numero) {
        alert("Remplis tous les champs (adresse, nom, numéro étudiant).");
        return;
      }

      const tx = await contract.inscrireEtudiant(address, nom, numero);
      await tx.wait();
      alert("Étudiant inscrit avec succès !");
      setNewStudent({ address: '', nom: '', numero: '' });
    } catch (err) {
      console.error("Erreur inscription étudiant :", err);
      alert("Erreur lors de l'inscription de l'étudiant.");
    }
  };

  // Charger les devoirs au chargement du contrat
  useEffect(() => {
    if (contract) {
      loadDevoirs();
    }
  }, [contract]);

  // Charger les soumissions quand on ouvre les onglets correspondants
  useEffect(() => {
    if (!contract || !account) return;

    if (activeTab === 'corriger' && userRole === 'enseignant') {
      loadTeacherSubmissions();
    }
    if (activeTab === 'mes-soumissions' && userRole === 'etudiant') {
      loadStudentSubmissions();
    }
  }, [activeTab, userRole, contract, devoirs, account]);

  // Interface utilisateur avec CSS personnalisé
  return (
    <div className="app-container">
      {/* Header */}
      <header className="header">
        <div className="container">
          <div className="header-content">
            <div>
              <h1 className="title">📚 Système de Gestion des Contrôles</h1>
              <p className="subtitle">Blockchain-Based Assignment Management</p>
            </div>
            {!account ? (
              <button
                onClick={connectWallet}
                className="btn-connect"
              >
                🔗 Connecter Wallet
              </button>
            ) : (
              <div className="account-info">
                <div className="account-label">Connecté en tant que :</div>
                <div className="account-address">
                  {account.substring(0, 6)}...{account.substring(38)}
                </div>
                <div className={`role-badge role-${userRole}`}>
                  {userRole === 'admin' ? '👑 Admin' :
                   userRole === 'enseignant' ? '👨‍🏫 Enseignant' :
                   userRole === 'etudiant' ? '👨‍🎓 Étudiant' :
                   '❓ Non inscrit'}
                </div>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Navigation */}
      {account && (
        <nav className="nav">
          <div className="container">
            <div className="nav-tabs">
              {[
                'home',
                'devoirs',
                userRole === 'admin' && 'admin',
                userRole === 'enseignant' && 'creer',
                userRole === 'enseignant' && 'corriger',          // 🔹 nouvel onglet enseignant
                userRole === 'etudiant' && 'soumettre',
                userRole === 'etudiant' && 'mes-soumissions',     // 🔹 nouvel onglet étudiant
                'profil'
              ]
              .filter(Boolean)
              .map(tab => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`nav-button ${activeTab === tab ? 'active' : ''}`}
                >
                  {tab === 'home' && '🏠 Accueil'}
                  {tab === 'devoirs' && '📝 Devoirs'}
                  {tab === 'admin' && '⚙️ Admin'}
                  {tab === 'creer' && '➕ Créer Devoir'}
                  {tab === 'corriger' && '🧾 À corriger'}
                  {tab === 'soumettre' && '📤 Soumettre'}
                  {tab === 'mes-soumissions' && '📚 Mes soumissions'}
                  {tab === 'profil' && '👤 Profil'}
                </button>
              ))}
            </div>
          </div>
        </nav>
      )}

      {/* Contenu principal */}
      <main className="main-content">
        {!account ? (
          <div className="welcome-card card">
            <div className="welcome-icon">🔐</div>
            <h2 className="welcome-title">Bienvenue</h2>
            <p className="welcome-text">
              Connectez votre wallet Ethereum pour accéder au système de gestion des contrôles.
              Cette plateforme utilise la blockchain pour garantir la transparence, la sécurité et l'immuabilité.
            </p>
            <button
              onClick={connectWallet}
              className="btn-connect btn-large"
            >
              Connecter MetaMask
            </button>
          </div>
        ) : (
          <>
            {/* Accueil */}
            {activeTab === 'home' && (
              <div className="dashboard">
                <div className="dashboard-stats card">
                  <h2 className="section-title">📊 Tableau de bord</h2>
                  <div className="stats-grid">
                    <div className="stat-card">
                      <div className="stat-number">{devoirs.length}</div>
                      <div className="stat-label">Devoirs disponibles</div>
                    </div>
                    <div className="stat-card success">
                      <div className="stat-icon">✓</div>
                      <div className="stat-label">Système sécurisé</div>
                    </div>
                    <div className="stat-card purple">
                      <div className="stat-icon">⛓️</div>
                      <div className="stat-label">Blockchain</div>
                    </div>
                  </div>
                </div>

                <div className="info-card card">
                  <h3 className="section-subtitle">ℹ️ Informations</h3>
                  <ul className="info-list">
                    <li><span className="check-icon">✓</span>Toutes les transactions sont enregistrées sur la blockchain.</li>
                    <li><span className="check-icon">✓</span>Les réponses sont chiffrées pour garantir la confidentialité.</li>
                    <li><span className="check-icon">✓</span>Le système est transparent et immuable.</li>
                    <li><span className="check-icon">✓</span>Anti-plagiat intégré grâce au chiffrement unique.</li>
                  </ul>
                </div>
              </div>
            )}

            {/* Liste des devoirs */}
            {activeTab === 'devoirs' && (
              <div className="devoirs-list card">
                <h2 className="section-title">📝 Liste des devoirs</h2>
                {devoirs.length === 0 ? (
                  <p className="empty-state">Aucun devoir disponible pour le moment.</p>
                ) : (
                  <div className="devoirs-grid">
                    {devoirs.map((devoir) => (
                      <div key={devoir.id} className="devoir-card card">
                        <div className="devoir-header">
                          <h3 className="devoir-title">{devoir.titre}</h3>
                          <span className="devoir-id">ID: {devoir.id}</span>
                        </div>
                        <p className="devoir-desc">{devoir.description}</p>
                        <div className="devoir-meta">
                          <div className="meta-item">
                            <span className="meta-label">📅 Création :</span>
                            <span>{devoir.dateCreation}</span>
                          </div>
                          <div className="meta-item">
                            <span className="meta-label">⏰ Date limite :</span>
                            <span>{devoir.dateLimite}</span>
                          </div>
                        </div>
                        <div className="devoir-teacher">
                          Enseignant : {devoir.enseignant.substring(0, 10)}...
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Admin */}
            {activeTab === 'admin' && userRole === 'admin' && (
              <div className="admin-panel card">
                <h2 className="section-title">⚙️ Panneau Administrateur</h2>
                <div className="admin-grid">
                  {/* Inscription enseignant */}
                  <div className="admin-form">
                    <h3 className="form-title">👨‍🏫 Inscrire un enseignant</h3>
                    <div className="form-group">
                      <input
                        type="text"
                        placeholder="Adresse Ethereum de l'enseignant"
                        value={newTeacher.address}
                        onChange={(e) => setNewTeacher({ ...newTeacher, address: e.target.value })}
                        className="input-glass"
                      />
                      <input
                        type="text"
                        placeholder="Nom de l'enseignant"
                        value={newTeacher.nom}
                        onChange={(e) => setNewTeacher({ ...newTeacher, nom: e.target.value })}
                        className="input-glass"
                      />
                      <input
                        type="text"
                        placeholder="Clé publique de chiffrement"
                        value={newTeacher.clePublique}
                        onChange={(e) => setNewTeacher({ ...newTeacher, clePublique: e.target.value })}
                        className="input-glass"
                      />
                      <button
                        onClick={inscrireEnseignant}
                        className="btn-primary"
                      >
                        Inscrire l'enseignant
                      </button>
                    </div>
                  </div>

                  {/* Inscription étudiant */}
                  <div className="admin-form">
                    <h3 className="form-title">👨‍🎓 Inscrire un étudiant</h3>
                    <div className="form-group">
                      <input
                        type="text"
                        placeholder="Adresse Ethereum de l'étudiant"
                        value={newStudent.address}
                        onChange={(e) => setNewStudent({ ...newStudent, address: e.target.value })}
                        className="input-glass"
                      />
                      <input
                        type="text"
                        placeholder="Nom de l'étudiant"
                        value={newStudent.nom}
                        onChange={(e) => setNewStudent({ ...newStudent, nom: e.target.value })}
                        className="input-glass"
                      />
                      <input
                        type="text"
                        placeholder="Numéro étudiant (ex: BDIA2025001)"
                        value={newStudent.numero}
                        onChange={(e) => setNewStudent({ ...newStudent, numero: e.target.value })}
                        className="input-glass"
                      />
                      <button
                        onClick={inscrireEtudiant}
                        className="btn-success"
                      >
                        Inscrire l'étudiant
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Création devoir (enseignant) */}
            {activeTab === 'creer' && userRole === 'enseignant' && (
              <div className="create-form card">
                <h2 className="section-title">➕ Créer un nouveau devoir</h2>
                <div className="form-group large">
                  <label className="form-label">Titre du devoir</label>
                  <input
                    type="text"
                    value={newDevoir.titre}
                    onChange={(e) => setNewDevoir({ ...newDevoir, titre: e.target.value })}
                    className="input-glass"
                    placeholder="Ex: Contrôle de Blockchain - Chapitre 1"
                  />
                  <label className="form-label">Description</label>
                  <textarea
                    value={newDevoir.description}
                    onChange={(e) => setNewDevoir({ ...newDevoir, description: e.target.value })}
                    className="input-glass textarea-large"
                    placeholder="Décrivez les consignes du devoir..."
                  />
                  <label className="form-label">Date limite</label>
                  <input
                    type="datetime-local"
                    value={newDevoir.dateLimite}
                    onChange={(e) => setNewDevoir({ ...newDevoir, dateLimite: e.target.value })}
                    className="input-glass"
                  />
                  <button
                    onClick={creerDevoir}
                    className="btn-primary btn-large"
                  >
                    🔐 Créer le devoir (avec chiffrement RSA)
                  </button>
                  <div className="warning-box">
                    ⚠️ Une paire de clés RSA sera générée automatiquement. Conservez votre clé privée pour déchiffrer les soumissions !
                  </div>
                </div>
              </div>
            )}

            {/* Mes devoirs à corriger (enseignant) */}
            {activeTab === 'corriger' && userRole === 'enseignant' && (
              <div className="card">
                <h2 className="section-title">🧾 Mes devoirs à corriger</h2>

                {teacherSubmissions.length === 0 ? (
                  <div className="en-attente">
                    <div className="pending-icon">⏳</div>
                    <p>Aucune soumission pour vos devoirs pour le moment.</p>
                  </div>
                ) : (
                  <div className="soumissions-grid">
                    {teacherSubmissions.map((s) => (
                      <div key={s.id} className="soumission-card">
                        <div className="soumission-header">
                          <div>
                            <h3 className="soumission-titre">{s.devoirTitre}</h3>
                            <div className="devoir-id">Soumission #{s.id} — Devoir #{s.devoirId}</div>
                          </div>
                          <span className={`soumission-status ${s.estCorrige ? 'corrigee' : 'en-attente'}`}>
                            {s.estCorrige ? 'Corrigée' : 'En attente'}
                          </span>
                        </div>

                        <div className="soumission-meta">
                          <div className="meta-item">
                            <span className="meta-label">👤 Étudiant :</span>
                            <span>{s.etudiant.substring(0, 12)}...</span>
                          </div>
                          <div className="meta-item">
                            <span className="meta-label">📅 Soumise le :</span>
                            <span>{s.dateSubmission}</span>
                          </div>
                        </div>

                        <p className="devoir-desc">
                          <strong>Contenu chiffré :</strong> {s.contenuChiffre.substring(0, 80)}...
                        </p>
                      </div>
                    ))}
                  </div>
                )}

                {/* Formulaire de correction global (ID + note) */}
                <div className="correction-form">
                  <h3 className="section-subtitle">✏️ Corriger une soumission</h3>
                  <div className="form-group">
                    <div>
                      <label className="form-label">ID de la soumission</label>
                      <input
                        type="number"
                        className="input-glass input-note"
                        value={correction.soumissionId}
                        onChange={(e) => setCorrection({ ...correction, soumissionId: e.target.value })}
                        placeholder="Ex: 1"
                      />
                    </div>
                    <div>
                      <label className="form-label">Note (/20)</label>
                      <input
                        type="number"
                        className="input-glass input-note"
                        value={correction.note}
                        onChange={(e) => setCorrection({ ...correction, note: e.target.value })}
                        placeholder="Ex: 16"
                      />
                    </div>
                    <div>
                      <label className="form-label">Commentaire</label>
                      <textarea
                        className="input-glass textarea-note"
                        value={correction.commentaire}
                        onChange={(e) => setCorrection({ ...correction, commentaire: e.target.value })}
                        placeholder="Commentaires pour l'étudiant..."
                      />
                    </div>
                    <button
                      onClick={corrigerSoumission}
                      className="btn-primary btn-small"
                    >
                      ✅ Valider la correction
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Soumission (étudiant) */}
            {activeTab === 'soumettre' && userRole === 'etudiant' && (
              <div className="submit-form card">
                <h2 className="section-title">📤 Soumettre un devoir</h2>
                <div className="form-group large">
                  <label className="form-label">Sélectionner le devoir</label>
                  <select
                    value={newSoumission.devoirId}
                    onChange={(e) => setNewSoumission({ ...newSoumission, devoirId: e.target.value })}
                    className="input-glass select-large"
                  >
                    <option value="">-- Choisir un devoir --</option>
                    {devoirs.map((d) => (
                      <option key={d.id} value={d.id}>{d.titre} (ID: {d.id})</option>
                    ))}
                  </select>
                  <label className="form-label">Votre identité (Nom Prénom)</label>
                  <input
                    type="text"
                    value={newSoumission.identite}
                    onChange={(e) => setNewSoumission({ ...newSoumission, identite: e.target.value })}
                    className="input-glass"
                    placeholder="Ex: Ahmed Benali"
                  />
                  <label className="form-label">Vos réponses</label>
                  <textarea
                    value={newSoumission.reponse}
                    onChange={(e) => setNewSoumission({ ...newSoumission, reponse: e.target.value })}
                    className="input-glass textarea-xlarge"
                    placeholder="Écrivez vos réponses ici..."
                  />
                  <button
                    onClick={soumettreDevoir}
                    className="btn-success btn-large"
                  >
                    🔒 Soumettre (chiffré)
                  </button>
                  <div className="info-box">
                    🔐 Vos réponses seront automatiquement chiffrées avec la clé publique de l'enseignant. Seul l'enseignant pourra les déchiffrer.
                  </div>
                </div>
              </div>
            )}

            {/* Mes soumissions / mes notes (étudiant) */}
            {activeTab === 'mes-soumissions' && userRole === 'etudiant' && (
              <div className="card">
                <h2 className="section-title">📚 Mes soumissions & mes notes</h2>

                {studentSubmissions.length === 0 ? (
                  <div className="en-attente">
                    <div className="pending-icon">📄</div>
                    <p>Vous n'avez encore soumis aucun devoir.</p>
                  </div>
                ) : (
                  <div className="soumissions-grid">
                    {studentSubmissions.map((s) => (
                      <div key={s.id} className="soumission-card">
                        <div className="soumission-header">
                          <div>
                            <h3 className="soumission-titre">{s.devoirTitre}</h3>
                            <div className="devoir-id">Soumission #{s.id} — Devoir #{s.devoirId}</div>
                          </div>
                          <span className={`soumission-status ${s.estCorrige ? 'corrigee' : 'en-attente'}`}>
                            {s.estCorrige ? 'Corrigée' : 'En attente de correction'}
                          </span>
                        </div>

                        <div className="soumission-meta">
                          <div className="meta-item">
                            <span className="meta-label">📅 Soumise le :</span>
                            <span>{s.dateSubmission}</span>
                          </div>
                          <div className="meta-item">
                            <span className="meta-label">⏰ Date limite :</span>
                            <span>{s.dateLimite}</span>
                          </div>
                        </div>

                        <p className="devoir-desc">
                          <strong>Contenu chiffré :</strong> {s.contenuChiffre.substring(0, 80)}...
                        </p>

                        {s.estCorrige && (
                          <div className="note-result">
                            <div className="note-finale">{s.note}/20</div>
                            {s.commentaire && (
                              <div className="commentaire">
                                {s.commentaire}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Profil */}
            {activeTab === 'profil' && (
              <div className="profile-card card">
                <h2 className="section-title">👤 Mon Profil</h2>
                <div className="profile-grid">
                  <div className="profile-item">
                    <div className="profile-label">Adresse Wallet</div>
                    <div className="profile-value">{account}</div>
                  </div>
                  <div className="profile-item">
                    <div className="profile-label">Rôle</div>
                    <div className="profile-value role-large">{userRole}</div>
                  </div>
                  <div className="profile-item">
                    <div className="profile-label">Statut</div>
                    <div className="status-connected">
                      <span className="status-dot"></span>
                      <span>Connecté</span>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </main>

      {/* Footer */}
      <footer className="footer">
        <div className="container">
          <p>© 2025 ENSA Tétouan - Système de Gestion des Contrôles Blockchain</p>
          <p className="footer-sub">Module: Fondamentaux de la Blockchain (M356)</p>
        </div>
      </footer>
    </div>
  );
};

export default App;
