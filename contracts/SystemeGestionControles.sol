// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

/**
 * @title SystemeGestionControles
 * @dev Gestion devoirs/contrôles + modules/coefs + fichiers off-chain + notes
 * -SEUL le PROF a une paire de clés RSA (publique + privée côté client)
 * - L’ETUDIANT n’a AUCUNE clé RSA (on enlève clePublique étudiant + sa fonction)
 * - Admin inscrit prof/étudiant SANS clés
 * - Prof définit sa clé publique RSA via Profile
 * - Admin crée modules + affecte étudiants aux modules
 * - Prof crée devoirs dans son module
 * - Étudiant soumet uniquement si inscrit au module + anti double soumission + deadline
 * - soumettreDevoir stocke le fichier + cleAESChiffree (chiffrée avec clé publique du prof)
 *
 * IMPORTANT : ne stocke JAMAIS la clé privée sur la blockchain.
 * Elle doit rester côté client (localStorage / fichier / etc.).
 */
contract SystemeGestionControles {
    // =========================
    // STRUCTURES
    // =========================

    struct Enseignant {
        address adresse;
        string nom;
        string clePublique; // définie par le prof lui-même (RSA public key base64/spki)
        bool estActif;
        uint256 dateInscription;
        uint256 moduleId; // 1 prof -> 1 module principal
    }

    struct Etudiant {
        address adresse;
        string nom;
        string numeroEtudiant;
        bool estActif;
        uint256 dateInscription;
    }

    struct Module {
        uint256 id;
        string nom;
        uint256 coefficient;
        address enseignant;
        bool estActif;
    }

    struct Devoir {
        uint256 id;
        address enseignant;
        uint256 moduleId;
        string titre;
        string description;
        string clePubliqueChiffrement;
        uint256 dateCreation;
        uint256 dateLimite;
        bool estActif;
    }

    struct SoumissionFichier {
        string hash;
        string nom;
        string fileType;
        string uri;
        string cleAESChiffree;
    }

    struct CorrectionFichier {
        string hash;
        string nom;
        string uri;
    }

    struct Soumission {
        uint256 id;
        uint256 devoirId;
        uint256 moduleId;
        address etudiant;

        string contenuChiffre;
        string identiteChiffree;

        SoumissionFichier fichier;

        uint256 dateSubmission;
        bool estCorrige;
        uint256 note; // /20
        string commentaire;

        CorrectionFichier fichierCorrection;
    }

    struct Annonce {
        uint256 id;
        address auteur;
        string titre;
        string contenu;
        uint256 dateCreation;
        bool estPublique;
    }

    // =========================
    // STATE
    // =========================

    address public administrateur;

    mapping(address => Enseignant) public enseignants;
    mapping(address => Etudiant) public etudiants;

    mapping(uint256 => Module) public modules;
    uint256[] public listeModules;
    uint256 public compteurModules;

    mapping(uint256 => Devoir) public devoirs;
    mapping(uint256 => Soumission) public soumissions;
    mapping(uint256 => Annonce) public annonces;

    address[] public listeEnseignants;
    address[] public listeEtudiants;

    uint256[] public listeDevoirs;
    uint256[] public listeSoumissions;
    uint256[] public listeAnnonces;

    uint256 public compteurDevoirs;
    uint256 public compteurSoumissions;
    uint256 public compteurAnnonces;

    mapping(uint256 => uint256[]) public soumissionsParDevoir;
    mapping(address => uint256[]) public soumissionsParEtudiant;

    // Empêcher double soumission
    mapping(uint256 => mapping(address => bool)) public aDejaSoumis;

    // Inscription des étudiants aux modules (un étudiant peut être dans plusieurs modules)
    mapping(uint256 => address[]) public etudiantsParModule; // moduleId -> liste d'adresses
    mapping(uint256 => mapping(address => bool)) public estInscritDansModule; // moduleId -> (etudiant -> bool)

    // =========================
    // EVENTS
    // =========================

    event EnseignantInscrit(address indexed adresse, string nom, uint256 moduleId);
    event EtudiantInscrit(address indexed adresse, string nom, string numeroEtudiant);

    event ClePubliqueEnseignantMiseAJour(address indexed enseignant);

    event ModuleCree(uint256 indexed moduleId, string nom, uint256 coefficient, address indexed enseignant);
    event EtudiantAffecteModule(uint256 indexed moduleId, address indexed etudiant);

    event DevoirCree(uint256 indexed devoirId, address indexed enseignant, string titre, uint256 moduleId);
    event SoumissionEnvoyee(uint256 indexed soumissionId, uint256 indexed devoirId, address indexed etudiant);
    event SoumissionCorrigee(uint256 indexed soumissionId, uint256 note);

    event AnnoncePubliee(uint256 indexed annonceId, address indexed auteur, string titre);

    // =========================
    // MODIFIERS
    // =========================

    modifier seulementAdmin() {
        require(msg.sender == administrateur, "Seul l'administrateur peut executer cette action");
        _;
    }

    modifier seulementEnseignant() {
        require(enseignants[msg.sender].estActif, "Seul un enseignant peut executer cette action");
        _;
    }

    modifier seulementEtudiant() {
        require(etudiants[msg.sender].estActif, "Seul un etudiant peut executer cette action");
        _;
    }

    modifier devoirExiste(uint256 _devoirId) {
        require(devoirs[_devoirId].id != 0 && devoirs[_devoirId].estActif, "Le devoir n'existe pas");
        _;
    }

    modifier moduleExiste(uint256 _moduleId) {
        require(modules[_moduleId].id != 0 && modules[_moduleId].estActif, "Module inexistant");
        _;
    }

    modifier soumissionExiste(uint256 _soumissionId) {
        require(soumissions[_soumissionId].id != 0, "Soumission inexistante");
        _;
    }

    constructor() {
        administrateur = msg.sender;
    }

    // =========================
    // MODULES (ADMIN)
    // =========================

    function creerModule(
        string calldata _nom,
        uint256 _coefficient,
        address _enseignant
    ) external seulementAdmin returns (uint256) {
        require(_coefficient > 0, "Coefficient invalide");
        require(_enseignant != address(0), "Adresse enseignant invalide");
        require(enseignants[_enseignant].estActif, "Enseignant non actif");
        require(enseignants[_enseignant].moduleId == 0, "Ce prof a deja un module"); // ✅ prof 1 seul module

        compteurModules++;
        modules[compteurModules] = Module({
            id: compteurModules,
            nom: _nom,
            coefficient: _coefficient,
            enseignant: _enseignant,
            estActif: true
        });

        listeModules.push(compteurModules);

        // Attacher le module au prof (1 prof -> 1 module principal)
        enseignants[_enseignant].moduleId = compteurModules;

        emit ModuleCree(compteurModules, _nom, _coefficient, _enseignant);
        return compteurModules;
    }

    function obtenirModules() external view returns (Module[] memory) {
        Module[] memory arr = new Module[](listeModules.length);
        for (uint256 i = 0; i < listeModules.length; i++) {
            arr[i] = modules[listeModules[i]];
        }
        return arr;
    }

    // =========================
    // INSCRIPTIONS (ADMIN)
    // =========================

    // Admin inscrit le prof SANS clé (le prof la mettra lui-même)
    function inscrireEnseignant(
        address _adresse,
        string calldata _nom
    ) external seulementAdmin {
        require(_adresse != address(0), "Adresse invalide");
        require(!enseignants[_adresse].estActif, "Enseignant deja inscrit");

        enseignants[_adresse] = Enseignant({
            adresse: _adresse,
            nom: _nom,
            clePublique: "", // vide au debut
            estActif: true,
            dateInscription: block.timestamp,
            moduleId: 0
        });

        listeEnseignants.push(_adresse);
        emit EnseignantInscrit(_adresse, _nom, 0);
    }

    // Admin inscrit l'étudiant SANS clé
    function inscrireEtudiant(
        address _adresse,
        string calldata _nom,
        string calldata _numeroEtudiant
    ) external seulementAdmin {
        require(_adresse != address(0), "Adresse invalide");
        require(!etudiants[_adresse].estActif, "Etudiant deja inscrit");

        etudiants[_adresse] = Etudiant({
            adresse: _adresse,
            nom: _nom,
            numeroEtudiant: _numeroEtudiant,
            estActif: true,
            dateInscription: block.timestamp
        });

        listeEtudiants.push(_adresse);
        emit EtudiantInscrit(_adresse, _nom, _numeroEtudiant);
    }

    // =========================
    // CLES PUBLIQUES (SELF-SERVICE)
    // =========================

    // Le prof définit sa clé publique depuis sa page profile
    function definirClePubliqueEnseignant(string calldata _clePublique) external seulementEnseignant {
        require(bytes(_clePublique).length > 0, "Cle publique vide");
        enseignants[msg.sender].clePublique = _clePublique;
        emit ClePubliqueEnseignantMiseAJour(msg.sender);
    }


    // =========================
    // AFFECTATION ETUDIANTS -> MODULE (ADMIN)
    // =========================

    function affecterEtudiantAuModule(uint256 _moduleId, address _etudiant)
        external
        seulementAdmin
        moduleExiste(_moduleId)
    {
        require(_etudiant != address(0), "Adresse etudiant invalide");
        require(etudiants[_etudiant].estActif, "Etudiant non actif");
        require(!estInscritDansModule[_moduleId][_etudiant], "Deja inscrit au module");

        estInscritDansModule[_moduleId][_etudiant] = true;
        etudiantsParModule[_moduleId].push(_etudiant);

        emit EtudiantAffecteModule(_moduleId, _etudiant);
    }

    function obtenirEtudiantsModule(uint256 _moduleId)
        external
        view
        returns (address[] memory)
    {
        return etudiantsParModule[_moduleId];
    }

    // =========================
    // DEVOIRS (ENSEIGNANT)
    // =========================

    function creerDevoir(
        uint256 _moduleId,
        string calldata _titre,
        string calldata _description,
        string calldata _clePubliqueChiffrement,
        uint256 _dateLimite
    ) external seulementEnseignant moduleExiste(_moduleId) returns (uint256) {
        require(_dateLimite > block.timestamp, "Date limite invalide");
        require(modules[_moduleId].enseignant == msg.sender, "Pas le prof de ce module");

        compteurDevoirs++;

        devoirs[compteurDevoirs] = Devoir({
            id: compteurDevoirs,
            enseignant: msg.sender,
            moduleId: _moduleId,
            titre: _titre,
            description: _description,
            clePubliqueChiffrement: _clePubliqueChiffrement,
            dateCreation: block.timestamp,
            dateLimite: _dateLimite,
            estActif: true
        });

        listeDevoirs.push(compteurDevoirs);
        emit DevoirCree(compteurDevoirs, msg.sender, _titre, _moduleId);
        return compteurDevoirs;
    }

    // =========================
    // SOUMISSIONS (ETUDIANT)
    // =========================

    function soumettreDevoir(
        uint256 _devoirId,
        string calldata _contenuChiffre,
        string calldata _identiteChiffree,
        string calldata _fichierHash,
        string calldata _fichierNom,
        string calldata _fichierType,
        string calldata _fichierURI,
        string calldata _cleAESChiffree
    ) external seulementEtudiant devoirExiste(_devoirId) returns (uint256) {
        require(block.timestamp <= devoirs[_devoirId].dateLimite, "Date limite depassee");
        require(!aDejaSoumis[_devoirId][msg.sender], "Deja soumis");

        uint256 moduleId = devoirs[_devoirId].moduleId;

        // IMPORTANT : seul un étudiant inscrit au module peut soumettre
        require(estInscritDansModule[moduleId][msg.sender], "Pas inscrit dans ce module");

        aDejaSoumis[_devoirId][msg.sender] = true;
        compteurSoumissions++;

        soumissions[compteurSoumissions] = Soumission({
            id: compteurSoumissions,
            devoirId: _devoirId,
            moduleId: moduleId,
            etudiant: msg.sender,
            contenuChiffre: _contenuChiffre,
            identiteChiffree: _identiteChiffree,
            fichier: SoumissionFichier({
                hash: _fichierHash,
                nom: _fichierNom,
                fileType: _fichierType,
                uri: _fichierURI,
                cleAESChiffree: _cleAESChiffree
            }),
            dateSubmission: block.timestamp,
            estCorrige: false,
            note: 0,
            commentaire: "",
            fichierCorrection: CorrectionFichier({ hash: "", nom: "", uri: "" })
        });

        listeSoumissions.push(compteurSoumissions);
        soumissionsParDevoir[_devoirId].push(compteurSoumissions);
        soumissionsParEtudiant[msg.sender].push(compteurSoumissions);

        emit SoumissionEnvoyee(compteurSoumissions, _devoirId, msg.sender);
        return compteurSoumissions;
    }

    // =========================
    // CORRECTION (ENSEIGNANT)
    // =========================

    function corrigerSoumission(
        uint256 _soumissionId,
        uint256 _note,
        string calldata _commentaire,
        string calldata _fichierCorrectionHash,
        string calldata _fichierCorrectionNom,
        string calldata _fichierCorrectionURI
    ) external seulementEnseignant soumissionExiste(_soumissionId) {
        require(_note <= 20, "Note invalide (0..20)");

        Soumission storage soumission = soumissions[_soumissionId];
        Devoir storage devoir = devoirs[soumission.devoirId];

        require(devoir.enseignant == msg.sender, "Pas l'enseignant de ce devoir");

        soumission.estCorrige = true;
        soumission.note = _note;
        soumission.commentaire = _commentaire;

        soumission.fichierCorrection.hash = _fichierCorrectionHash;
        soumission.fichierCorrection.nom = _fichierCorrectionNom;
        soumission.fichierCorrection.uri = _fichierCorrectionURI;

        emit SoumissionCorrigee(_soumissionId, _note);
    }

    // =========================
    // ANNONCES
    // =========================

    function publierAnnonce(
        string calldata _titre,
        string calldata _contenu,
        bool _estPublique
    ) external returns (uint256) {
        require(
            enseignants[msg.sender].estActif || etudiants[msg.sender].estActif,
            "Seuls les membres inscrits peuvent publier"
        );

        compteurAnnonces++;

        annonces[compteurAnnonces] = Annonce({
            id: compteurAnnonces,
            auteur: msg.sender,
            titre: _titre,
            contenu: _contenu,
            dateCreation: block.timestamp,
            estPublique: _estPublique
        });

        listeAnnonces.push(compteurAnnonces);
        emit AnnoncePubliee(compteurAnnonces, msg.sender, _titre);

        return compteurAnnonces;
    }

    // =========================
    // LECTURE
    // =========================

    function obtenirDevoir(uint256 _devoirId) external view returns (Devoir memory) {
        return devoirs[_devoirId];
    }

    function obtenirSoumission(uint256 _soumissionId) external view returns (Soumission memory) {
        return soumissions[_soumissionId];
    }

    function obtenirSoumissionsDevoir(uint256 _devoirId) external view returns (uint256[] memory) {
        return soumissionsParDevoir[_devoirId];
    }

    function obtenirSoumissionsEtudiant(address _etudiant) external view returns (uint256[] memory) {
        return soumissionsParEtudiant[_etudiant];
    }

    function obtenirTousLesDevoirs() external view returns (uint256[] memory) {
        return listeDevoirs;
    }

    function estEnseignant(address _adresse) external view returns (bool) {
        return enseignants[_adresse].estActif;
    }

    function estEtudiant(address _adresse) external view returns (bool) {
        return etudiants[_adresse].estActif;
    }

    function obtenirNotesEtudiant(address _etudiant)
        external
        view
        returns (uint256[] memory soumissionIds, uint256[] memory notes, uint256[] memory moduleIds)
    {
        uint256[] memory ids = soumissionsParEtudiant[_etudiant];
        soumissionIds = new uint256[](ids.length);
        notes = new uint256[](ids.length);
        moduleIds = new uint256[](ids.length);

        for (uint256 i = 0; i < ids.length; i++) {
            Soumission storage s = soumissions[ids[i]];
            soumissionIds[i] = s.id;
            notes[i] = s.note;
            moduleIds[i] = s.moduleId;
        }
    }
}
